import { randomUUID } from 'node:crypto'
import db from '../config/db.js'
import { createNotification } from './notifications/notificationService.js'
import { canRemoveOverrideHistory } from './scheduleRollbackValidation.js'

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
    const [cohortResult, venueResult, programmeResult, unitResult] =
      await Promise.all([
        connection.execute(
          `SELECT ec.cohort_id, ec.student_count, c.programme_id
           FROM exam_cohorts ec
           JOIN cohorts c ON c.id = ec.cohort_id
           WHERE ec.exam_id = ?`,
          [exam.id]
        ),
        connection.execute(
          `SELECT venue_id, allocated_capacity, student_count
           FROM exam_venue_allocations WHERE exam_id = ?`,
          [exam.id]
        ),
        connection.execute(
          `SELECT DISTINCT c.programme_id
           FROM exam_cohorts ec
           JOIN cohorts c ON c.id = ec.cohort_id
           WHERE ec.exam_id = ?`,
          [exam.id]
        ),
        connection.execute(
          'SELECT year_level FROM units WHERE id = ?',
          [exam.unit_id]
        )
      ])
    const cohortRows = cohortResult[0]
    const venueRows = venueResult[0]
    const programmeRows = programmeResult[0]
    const unitRows = unitResult[0]
    const group = {
      course_id: Number(exam.unit_id),
      study_year: Number(unitRows[0]?.year_level) || null,
      programme_ids: programmeRows.map(row => Number(row.programme_id)),
      cohort_allocations: cohortRows.map(row => ({
        cohortId: Number(row.cohort_id),
        studentCount: Number(row.student_count),
        programmeId: Number(row.programme_id)
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
      study_year: group.study_year,
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
  createdDrafts,
  lecturerNotifications
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
      'SELECT id, status FROM schedule_overrides WHERE timetable_entry_id = ? FOR UPDATE',
      [entry.id]
    )
    if (!canRemoveOverrideHistory(overrideRows)) {
      throw new Error(
        `Timetable event ${entry.id} still has an active or unresolved make-up class. Cancel it before rolling the event back.`
      )
    }
    const [cohortResult, lecturerResult] = await Promise.all([
      connection.execute(
        `SELECT c.id AS cohort_id, c.programme_id
         FROM cohorts c
         WHERE c.id = ? OR c.id IN (
           SELECT cohort_id FROM timetable_entry_cohorts
           WHERE timetable_entry_id = ?
         )`,
        [entry.cohort_id, entry.id]
      ),
      connection.execute(
        `SELECT l.user_id, u.code AS unit_code, u.name AS unit_name,
           v.name AS venue_name, v.code AS venue_code
         FROM timetable_entries te
         LEFT JOIN lecturers l ON l.id = te.lecturer_id
         LEFT JOIN units u ON u.id = te.unit_id
         LEFT JOIN venues v ON v.id = te.venue_id
         WHERE te.id = ?`,
        [entry.id]
      )
    ])
    const cohortRows = cohortResult[0]
    const lecturerDetails = lecturerResult[0][0]
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
      cohort_ids: normalizeIds(cohortRows.map(row => row.cohort_id)),
      programme_ids: normalizeIds(cohortRows.map(row => row.programme_id))
    }
    const draftId = randomUUID()
    await connection.execute(
      `INSERT INTO schedule_drafts (id, kind, payload, created_by)
       VALUES (?, 'timetable', ?, ?)`,
      [draftId, JSON.stringify(payload), actorId]
    )
    if (overrideRows.length) {
      await connection.execute(
        'DELETE FROM schedule_overrides WHERE timetable_entry_id = ?',
        [entry.id]
      )
    }
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
    if (lecturerDetails?.user_id) {
      lecturerNotifications.push({
        userId: Number(lecturerDetails.user_id),
        entryId: Number(entry.id),
        unit: [lecturerDetails.unit_code, lecturerDetails.unit_name]
          .filter(Boolean)
          .join(' · ') || 'Class',
        day: entry.day_of_week,
        startTime: String(entry.start_time || '').slice(0, 5),
        endTime: String(entry.end_time || '').slice(0, 5),
        venue: [lecturerDetails.venue_code, lecturerDetails.venue_name]
          .filter(Boolean)
          .join(' · ') || 'Unassigned venue',
        hadCancelledMakeups: overrideRows.length > 0
      })
    }
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
  const lecturerNotifications = []
  try {
    await connection.beginTransaction()
    await rollbackExams(connection, examIds, Number(actor.id), createdDrafts)
    await rollbackTimetableEntries(
      connection,
      timetableIds,
      Number(actor.id),
      createdDrafts,
      lecturerNotifications
    )
    await connection.commit()
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }

  const notificationResults = await Promise.allSettled(
    lecturerNotifications.map(details =>
      createNotification({
        userId: details.userId,
        type: 'schedule:event_rolled_back',
        title: 'Timetable event returned to staging',
        message:
          `${details.unit} on ${details.day}, ${details.startTime}–${details.endTime} ` +
          `at ${details.venue} was rolled back to staging by an administrator. ` +
          `It will not appear as a published class until the staged event is published again.` +
          (details.hadCancelledMakeups
            ? ' Its cancelled make-up history was cleared as part of the rollback.'
            : ''),
        entityType: 'timetable_entry',
        entityId: details.entryId
      })
    )
  )
  notificationResults.forEach((notificationResult, index) => {
    if (notificationResult.status === 'rejected') {
      console.error('[SCHEDULE][EVENT_ROLLBACK_NOTIFICATION_FAILED]', {
        eventId: lecturerNotifications[index].entryId,
        userId: lecturerNotifications[index].userId,
        error: notificationResult.reason?.message || 'Unknown notification error'
      })
    }
  })
  return createdDrafts
}
