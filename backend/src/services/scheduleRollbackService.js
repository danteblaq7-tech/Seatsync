import { randomUUID } from 'node:crypto'
import db from '../config/db.js'

const normalizeIds = values =>
  [...new Set((Array.isArray(values) ? values : []).map(Number).filter(id =>
    Number.isInteger(id) && id > 0
  ))]

const rollbackExams = async (connection, ids, actorId, createdDrafts) => {
  if (!ids.length) return
  const placeholders = ids.map(() => '?').join(',')
  const [exams] = await connection.execute(
    `SELECT e.*, DATE_FORMAT(e.exam_date, '%Y-%m-%d') AS exam_date_iso
     FROM exams e
     WHERE e.id IN (${placeholders}) AND e.status = 'SCHEDULED'
       AND e.exam_date >= CURDATE()
     FOR UPDATE`,
    ids
  )
  if (exams.length !== ids.length) {
    throw new Error(
      'One or more selected exams are no longer scheduled or are in the past.'
    )
  }

  for (const exam of exams) {
    const [cohortResult, venueResult, programmeResult] = await Promise.all([
      connection.execute(
        'SELECT cohort_id, student_count FROM exam_cohorts WHERE exam_id = ?',
        [exam.id]
      ),
      connection.execute(
        `SELECT venue_id, allocated_capacity, student_count
         FROM exam_venue_allocations WHERE exam_id = ?`,
        [exam.id]
      ),
      connection.execute(
        `SELECT up.programme_id FROM unit_programmes up
         WHERE up.unit_id = ?`,
        [exam.unit_id]
      )
    ])
    const cohortRows = cohortResult[0]
    const venueRows = venueResult[0]
    const programmeRows = programmeResult[0]
    const group = {
      course_id: Number(exam.unit_id),
      programme_ids: programmeRows.map(row => Number(row.programme_id)),
      cohort_allocations: cohortRows.map(row => ({
        cohortId: Number(row.cohort_id),
        studentCount: Number(row.student_count)
      })),
      venue_allocations: venueRows.map(row => ({
        venueId: Number(row.venue_id),
        allocatedCapacity: Number(row.allocated_capacity),
        studentCount: Number(row.student_count)
      }))
    }
    const payload = {
      academic_year_id: Number(exam.academic_year_id),
      semester_id: Number(exam.semester_id),
      course_id: Number(exam.unit_id),
      programme_ids: group.programme_ids,
      study_year: null,
      exam_date: exam.exam_date_iso,
      start_time: exam.start_time,
      end_time: exam.end_time,
      duration_minutes: Number(exam.duration_minutes),
      instructions: exam.instructions || '',
      sitting_group_id: exam.sitting_group_id || null,
      unit_groups: [group]
    }
    const draftId = randomUUID()
    await connection.execute(
      `INSERT INTO schedule_drafts (id, kind, payload, created_by)
       VALUES (?, 'exam', ?, ?)`,
      [draftId, JSON.stringify(payload), actorId]
    )
    await connection.execute('DELETE FROM exams WHERE id = ?', [exam.id])
    await connection.execute(
      `INSERT INTO audit_logs
       (user_id, action, entity_type, entity_id, new_values)
       VALUES (?, 'ROLLBACK_TO_STAGING', 'exam', ?, ?)`,
      [actorId, exam.id, JSON.stringify({ draft_id: draftId, ...payload })]
    )
    createdDrafts.push({ id: draftId, kind: 'exam', sourceId: Number(exam.id) })
  }
}

const rollbackTimetableEntries = async (
  connection,
  ids,
  actorId,
  createdDrafts
) => {
  if (!ids.length) return
  const placeholders = ids.map(() => '?').join(',')
  const [entries] = await connection.execute(
    `SELECT * FROM timetable_entries
     WHERE id IN (${placeholders}) AND status = 'SCHEDULED'
     FOR UPDATE`,
    ids
  )
  if (entries.length !== ids.length) {
    throw new Error(
      'One or more selected timetable events are no longer scheduled.'
    )
  }

  for (const entry of entries) {
    const [overrideRows] = await connection.execute(
      'SELECT id FROM schedule_overrides WHERE timetable_entry_id = ? LIMIT 1',
      [entry.id]
    )
    if (overrideRows.length) {
      throw new Error(
        `Timetable event ${entry.id} has make-up class history and cannot be rolled back while those overrides remain.`
      )
    }
    const [cohortResult, programmeResult] = await Promise.all([
      connection.execute(
        `SELECT cohort_id FROM timetable_entry_cohorts
         WHERE timetable_entry_id = ?`,
        [entry.id]
      ),
      connection.execute(
        `SELECT programme_id FROM timetable_entry_programmes
         WHERE timetable_entry_id = ?`,
        [entry.id]
      )
    ])
    const cohortRows = cohortResult[0]
    const programmeRows = programmeResult[0]
    const payload = {
      academic_year_id: Number(entry.academic_year_id),
      semester_id: Number(entry.semester_id),
      course_id: Number(entry.unit_id),
      lecturer_id: Number(entry.lecturer_id),
      venue_id: Number(entry.venue_id),
      day_of_week: entry.day_of_week,
      start_time: entry.start_time,
      end_time: entry.end_time,
      event_type: entry.event_type,
      status: 'SCHEDULED',
      cohort_ids: [
        ...new Set([
          ...(entry.cohort_id ? [Number(entry.cohort_id)] : []),
          ...cohortRows.map(row => Number(row.cohort_id))
        ])
      ],
      programme_ids: programmeRows.map(row => Number(row.programme_id))
    }
    const draftId = randomUUID()
    await connection.execute(
      `INSERT INTO schedule_drafts (id, kind, payload, created_by)
       VALUES (?, 'timetable', ?, ?)`,
      [draftId, JSON.stringify(payload), actorId]
    )
    await connection.execute('DELETE FROM timetable_entries WHERE id = ?', [
      entry.id
    ])
    await connection.execute(
      `INSERT INTO audit_logs
       (user_id, action, entity_type, entity_id, new_values)
       VALUES (?, 'ROLLBACK_TO_STAGING', 'timetable_entry', ?, ?)`,
      [actorId, entry.id, JSON.stringify({ draft_id: draftId, ...payload })]
    )
    createdDrafts.push({
      id: draftId,
      kind: 'timetable',
      sourceId: Number(entry.id)
    })
  }
}

export const rollbackScheduleItems = async (items, actor) => {
  if (!(actor?.roles || []).includes('ADMIN')) {
    throw new Error('Only administrators may roll published items back to staging.')
  }
  if (!Array.isArray(items) || !items.length || items.length > 100) {
    throw new Error('Select between 1 and 100 published items to roll back.')
  }

  const examIds = normalizeIds(
    items.filter(item => item?.kind === 'exam').map(item => item.id)
  )
  const timetableIds = normalizeIds(
    items
      .filter(item => item?.kind === 'timetable')
      .map(item => item.id)
  )
  if (
    examIds.length +
      timetableIds.length !==
    items.length
  ) {
    throw new Error('Select valid exams or timetable events to roll back.')
  }

  const connection = await db.getConnection()
  const createdDrafts = []
  try {
    await connection.beginTransaction()
    await rollbackExams(connection, examIds, Number(actor.id), createdDrafts)
    await rollbackTimetableEntries(
      connection,
      timetableIds,
      Number(actor.id),
      createdDrafts
    )
    await connection.commit()
    return createdDrafts
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}
