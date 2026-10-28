import db from '../config/db.js'
import { assertNoStagedDraftConflict } from './scheduleDraftConflict.js'

const run = async (connection, sql, params = []) => {
  const [rows] = await connection.execute(sql, params)
  return rows
}

const get = (record, snake, camel) => record?.[snake] ?? record?.[camel]

const assertNoTimetableConflict = async (
  connection,
  event,
  excludeEntryId = null
) => {
  const day = String(get(event, 'day_of_week', 'dayOfWeek') || '')
    .slice(0, 3)
    .toUpperCase()
  const start = get(event, 'start_time', 'startTime')
  const end = get(event, 'end_time', 'endTime')
  const venueId = Number(get(event, 'venue_id', 'venueId'))
  const lecturerId = Number(get(event, 'lecturer_id', 'lecturerId'))
  const exclusion = excludeEntryId ? 'AND te.id <> ?' : ''
  const exclusionParams = excludeEntryId ? [Number(excludeEntryId)] : []
  const cohortIds = (get(event, 'cohort_ids', 'cohortIds') || [])
    .map(Number)
    .filter(Boolean)
  if (
    !venueId ||
    !lecturerId ||
    !start ||
    !end ||
    String(start) >= String(end) ||
    !day
  ) {
    throw new Error(
      'A timetable event is missing a valid day, time, lecturer, or venue.'
    )
  }
  const [academicRows, unitRows, lecturerRecordRows, venueRecordRows] =
    await Promise.all([
      run(connection, 'SELECT id FROM academic_years WHERE id = ?', [
        Number(get(event, 'academic_year_id', 'academicYearId'))
      ]),
      run(connection, 'SELECT id FROM units WHERE id = ?', [
        Number(get(event, 'course_id', 'courseId'))
      ]),
      run(
        connection,
        "SELECT id FROM lecturers WHERE id = ? AND employment_status = 'ACTIVE'",
        [lecturerId]
      ),
      run(
        connection,
        "SELECT id FROM venues WHERE id = ? AND status = 'ACTIVE'",
        [venueId]
      )
    ])
  if (
    !academicRows.length ||
    !unitRows.length ||
    !lecturerRecordRows.length ||
    !venueRecordRows.length
  ) {
    throw new Error(
      'The academic year, unit, active lecturer, or active venue is invalid.'
    )
  }
  const expectedStudents = Number(
    get(event, 'expected_students', 'expectedStudents') || 0
  )
  const allowCapacityOverride = Boolean(
    get(event, 'allow_capacity_override', 'allowCapacityOverride')
  )
  const [venueCapacityRows] = await connection.execute(
    'SELECT capacity FROM venues WHERE id = ?',
    [venueId]
  )
  if (
    !allowCapacityOverride &&
    expectedStudents > Number(venueCapacityRows[0]?.capacity || 0)
  ) {
    throw new Error(
      'Expected cohort attendance exceeds the selected venue capacity.'
    )
  }

  const venueConflicts = await run(
    connection,
    `SELECT te.id, te.start_time, te.end_time, v.name AS venue_name
    FROM timetable_entries te JOIN venues v ON v.id = te.venue_id
    WHERE te.status = 'SCHEDULED' AND te.venue_id = ?
      AND LEFT(UPPER(te.day_of_week), 3) = ?
      AND te.start_time < ? AND te.end_time > ?
      ${excludeEntryId ? 'AND te.id <> ?' : ''} LIMIT 1`,
    [venueId, day, end, start, ...exclusionParams]
  )
  if (venueConflicts.length) {
    const conflict = venueConflicts[0]
    throw new Error(
      `Venue conflict: ${
        conflict.venue_name || `venue ${venueId}`
      } already has event #${conflict.id} on ${day}, ${String(
        conflict.start_time
      ).slice(0, 5)}–${String(conflict.end_time).slice(
        0,
        5
      )}; proposed event is ${String(start).slice(0, 5)}–${String(end).slice(
        0,
        5
      )}.`
    )
  }

  const blocked = await run(
    connection,
    `SELECT id, start_datetime, end_datetime FROM venue_blocks
    WHERE venue_id = ? AND status = 'ACTIVE'
      AND LEFT(UPPER(DAYNAME(start_datetime)), 3) = ?
      AND TIME(start_datetime) < ? AND TIME(end_datetime) > ? LIMIT 1`,
    [venueId, day, end, start]
  )
  if (blocked.length) {
    const block = blocked[0]
    throw new Error(
      `Venue conflict: venue ${venueId} is blocked ${String(
        block.start_datetime
      ).slice(11, 16)}–${String(block.end_datetime).slice(
        11,
        16
      )} on ${day}; proposed event is ${String(start).slice(0, 5)}–${String(
        end
      ).slice(0, 5)}.`
    )
  }

  const lecturerRows = await run(
    connection,
    `SELECT te.id, te.start_time, te.end_time FROM timetable_entries te
    WHERE te.status = 'SCHEDULED' AND te.lecturer_id = ? AND LEFT(UPPER(te.day_of_week), 3) = ?
      AND te.start_time < ? AND te.end_time > ? ${exclusion} LIMIT 1`,
    [lecturerId, day, end, start, ...exclusionParams]
  )
  if (lecturerRows.length) {
    const conflict = lecturerRows[0]
    throw new Error(
      `Lecturer conflict: lecturer ${lecturerId} already has event #${
        conflict.id
      } on ${day}, ${String(conflict.start_time).slice(0, 5)}–${String(
        conflict.end_time
      ).slice(0, 5)}.`
    )
  }

  if (cohortIds.length) {
    const cohortRows = await run(
      connection,
      `SELECT te.id, te.start_time, te.end_time, c.name AS cohort_name
      FROM timetable_entries te
      LEFT JOIN timetable_entry_cohorts tec ON tec.timetable_entry_id = te.id
      LEFT JOIN cohorts c ON c.id = COALESCE(tec.cohort_id, te.cohort_id)
      WHERE te.status = 'SCHEDULED' AND LEFT(UPPER(te.day_of_week), 3) = ?
        AND te.start_time < ? AND te.end_time > ?
        ${excludeEntryId ? 'AND te.id <> ?' : ''}
        AND (te.cohort_id IN (${cohortIds.map(() => '?').join(',')})
          OR tec.cohort_id IN (${cohortIds.map(() => '?').join(',')})) LIMIT 1`,
      [day, end, start, ...exclusionParams, ...cohortIds, ...cohortIds]
    )
    if (cohortRows.length) {
      const conflict = cohortRows[0]
      throw new Error(
        `Cohort conflict: ${
          conflict.cohort_name || 'a selected cohort'
        } already has event #${conflict.id} on ${day}, ${String(
          conflict.start_time
        ).slice(0, 5)}–${String(conflict.end_time).slice(0, 5)}.`
      )
    }
  }
}

const assertNoExamConflict = async (
  connection,
  exam,
  cohortIds,
  venueAllocations,
  excludeExamId = null
) => {
  const date = String(get(exam, 'exam_date', 'examDate')).slice(0, 10)
  const start = get(exam, 'start_time', 'startTime')
  const end = get(exam, 'end_time', 'endTime')
  const courseId = Number(exam?.unit_id ?? get(exam, 'course_id', 'courseId'))
  const excludeExamParams = excludeExamId ? [Number(excludeExamId)] : []
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !start ||
    !end ||
    String(start).slice(0, 5) >= String(end).slice(0, 5)
  ) {
    throw new Error('The exam needs a valid date and a positive time range.')
  }
  const uniqueCohortIds = [...new Set(cohortIds.map(Number).filter(Boolean))]
  const venueIds = venueAllocations.map(item =>
    Number(get(item, 'venue_id', 'venueId'))
  )
  if (uniqueCohortIds.length !== cohortIds.length) {
    throw new Error('Each cohort can only be added once to an exam.')
  }
  if (venueIds.some(id => !id) || new Set(venueIds).size !== venueIds.length) {
    throw new Error('Each venue can only be added once to an exam.')
  }
  const unitRows = await run(
    connection,
    `SELECT e.id, e.start_time, e.end_time, u.code, u.name
    FROM exams e LEFT JOIN units u ON u.id = e.unit_id
    WHERE e.status = 'SCHEDULED' AND e.unit_id = ? AND e.exam_date = ?
      AND e.start_time < ? AND e.end_time > ?
      ${excludeExamId ? 'AND e.id <> ?' : ''} LIMIT 1`,
    [courseId, date, end, start, ...excludeExamParams]
  )
  if (unitRows.length) {
    const conflict = unitRows[0]
    throw new Error(
      `Unit conflict: ${
        [conflict.code, conflict.name].filter(Boolean).join(' · ') ||
        `unit ${courseId}`
      } already has exam #${conflict.id} on ${date}, ${String(
        conflict.start_time
      ).slice(0, 5)}–${String(conflict.end_time).slice(0, 5)}.`
    )
  }

  for (const cohortId of uniqueCohortIds) {
    const rows = await run(
      connection,
      `SELECT e.id, e.start_time, e.end_time, c.name AS cohort_name FROM exams e
      JOIN exam_cohorts ec ON ec.exam_id = e.id
      JOIN cohorts c ON c.id = ec.cohort_id
      WHERE e.status = 'SCHEDULED' AND ec.cohort_id = ? AND e.exam_date = ?
        AND e.start_time < ? AND e.end_time > ?
        ${excludeExamId ? 'AND e.id <> ?' : ''} LIMIT 1`,
      [cohortId, date, end, start, ...excludeExamParams]
    )
    if (rows.length) {
      const conflict = rows[0]
      throw new Error(
        `Cohort conflict: ${
          conflict.cohort_name || `cohort ${cohortId}`
        } already has exam #${conflict.id} on ${date}, ${String(
          conflict.start_time
        ).slice(0, 5)}–${String(conflict.end_time).slice(0, 5)}.`
      )
    }
  }

  for (const allocation of venueAllocations) {
    const venueId = Number(get(allocation, 'venue_id', 'venueId'))
    const examRows = await run(
      connection,
      `SELECT e.id, e.start_time, e.end_time, v.name AS venue_name FROM exams e
      JOIN exam_venue_allocations eva ON eva.exam_id = e.id
      JOIN venues v ON v.id = eva.venue_id
      WHERE e.status = 'SCHEDULED' AND eva.venue_id = ? AND e.exam_date = ?
        AND e.start_time < ? AND e.end_time > ?
        ${excludeExamId ? 'AND e.id <> ?' : ''} LIMIT 1`,
      [venueId, date, end, start, ...excludeExamParams]
    )
    if (examRows.length) {
      const conflict = examRows[0]
      throw new Error(
        `Venue conflict: ${
          conflict.venue_name || `venue ${venueId}`
        } already has exam #${conflict.id} on ${date}, ${String(
          conflict.start_time
        ).slice(0, 5)}–${String(conflict.end_time).slice(0, 5)}.`
      )
    }
    const venue = (
      await run(connection, 'SELECT capacity FROM venues WHERE id = ?', [
        venueId
      ])
    )[0]
    const allocated = Number(
      get(allocation, 'allocated_capacity', 'allocatedCapacity')
    )
    const students = Number(
      get(allocation, 'student_count', 'studentCount') ?? allocated
    )
    if (
      !venue ||
      allocated < 1 ||
      allocated > Number(venue.capacity) ||
      students < 1 ||
      students > allocated
    ) {
      throw new Error(
        'An exam venue allocation is invalid or exceeds venue capacity.'
      )
    }
  }
}

export const validateScheduleDraft = async (draft, pendingDrafts, actor) => {
  if (
    !draft ||
    !['timetable', 'timetable_update', 'exam', 'exam_update'].includes(
      draft.kind
    )
  ) {
    throw new Error('Select a valid timetable event or exam draft.')
  }
  const payload = draft.payload || {}
  const connection = await db.getConnection()
  try {
    await connection.beginTransaction()
    const [storedDraftRows] = await connection.execute(
      `SELECT id, kind, payload, created_by AS createdBy
       FROM schedule_drafts ${draft.id ? 'WHERE id <> ?' : ''}
       ORDER BY created_at, id FOR UPDATE`,
      draft.id ? [String(draft.id)] : []
    )
    const storedDrafts = storedDraftRows.map(row => ({
      ...row,
      id: String(row.id),
      payload:
        typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
      createdBy: Number(row.createdBy)
    }))
    assertNoStagedDraftConflict(draft, storedDrafts)
    if (draft.kind === 'timetable' || draft.kind === 'timetable_update') {
      if (
        draft.kind === 'timetable_update' &&
        !(actor?.roles || []).includes('ADMIN')
      ) {
        throw new Error('Only administrators may stage timetable edits.')
      }
      const entryId = Number(
        payload.timetable_entry_id ?? payload.timetableEntryId
      )
      if (draft.kind === 'timetable_update' && entryId) {
        const rows = await run(
          connection,
          'SELECT id FROM timetable_entries WHERE id = ?',
          [entryId]
        )
        if (!rows.length)
          throw new Error('The timetable event no longer exists.')
      }
      const lecturerId = Number(get(payload, 'lecturer_id', 'lecturerId'))
      if ((actor?.roles || []).includes('LECTURER')) {
        const rows = await run(
          connection,
          'SELECT user_id FROM lecturers WHERE id = ?',
          [lecturerId]
        )
        if (Number(rows[0]?.user_id) !== Number(actor.id)) {
          throw new Error(
            'Lecturers may only stage their own timetable events.'
          )
        }
      }
      await assertNoTimetableConflict(
        connection,
        payload,
        draft.kind === 'timetable_update' ? entryId : null
      )
    } else {
      if (!(actor?.roles || []).includes('ADMIN')) {
        throw new Error('Only administrators may stage exams.')
      }
      const examId = Number(payload.exam_id ?? payload.examId)
      if (draft.kind === 'exam_update') {
        if (!examId) throw new Error('The exam edit is missing its exam ID.')
        const rows = await run(
          connection,
          "SELECT id FROM exams WHERE id = ? AND status = 'SCHEDULED'",
          [examId]
        )
        if (!rows.length)
          throw new Error('The scheduled exam no longer exists.')
      }
      const cohortAllocations = payload.cohort_allocations || []
      const venueAllocations = payload.venue_allocations || []
      const cohortIds = cohortAllocations
        .map(item => Number(get(item, 'cohort_id', 'cohortId')))
        .filter(Boolean)
      if (!cohortIds.length || !venueAllocations.length) {
        throw new Error(
          'Each exam needs at least one cohort and venue allocation.'
        )
      }
      const [academicRows, semesterRows, unitRows] = await Promise.all([
        run(connection, 'SELECT id FROM academic_years WHERE id = ?', [
          Number(get(payload, 'academic_year_id', 'academicYearId'))
        ]),
        run(
          connection,
          'SELECT id FROM semesters WHERE id = ? AND academic_year_id = ?',
          [
            Number(get(payload, 'semester_id', 'semesterId')),
            Number(get(payload, 'academic_year_id', 'academicYearId'))
          ]
        ),
        run(connection, 'SELECT id FROM units WHERE id = ?', [
          Number(get(payload, 'course_id', 'courseId'))
        ])
      ])
      if (!academicRows.length || !semesterRows.length || !unitRows.length) {
        throw new Error('The exam academic year, semester, or unit is invalid.')
      }
      const cohortStudents = cohortAllocations.reduce(
        (total, item) =>
          total + Number(get(item, 'student_count', 'studentCount') || 0),
        0
      )
      const venueStudents = venueAllocations.reduce(
        (total, item) =>
          total + Number(get(item, 'student_count', 'studentCount') || 0),
        0
      )
      if (venueStudents < cohortStudents) {
        throw new Error(
          `Venue allocations cover ${venueStudents} students, but the selected cohorts contain ${cohortStudents}.`
        )
      }
      await assertNoExamConflict(
        connection,
        payload,
        cohortIds,
        venueAllocations,
        draft.kind === 'exam_update' ? examId : null
      )
    }
    await connection.rollback()
    return { valid: true }
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

export const publishScheduleDrafts = async (draftReferences, actor) => {
  if (!Array.isArray(draftReferences) || !draftReferences.length)
    throw new Error('There are no pending schedule items to publish.')
  if (draftReferences.length > 100)
    throw new Error('Publish up to 100 schedule items at a time.')
  const draftIds = [
    ...new Set(
      draftReferences
        .map(value => (typeof value === 'string' ? value : value?.id))
        .filter(Boolean)
        .map(String)
    )
  ]
  if (!draftIds.length) throw new Error('Select pending items to publish.')

  const connection = await db.getConnection()
  try {
    await connection.beginTransaction()
    const [allRows] = await connection.execute(
      'SELECT id, kind, payload, created_by FROM schedule_drafts ORDER BY created_at, id FOR UPDATE'
    )
    const parseDraft = row => ({
      id: String(row.id),
      kind: row.kind,
      payload:
        typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
      createdBy: Number(row.created_by)
    })
    const allDrafts = allRows.map(parseDraft)
    const selectedIdSet = new Set(draftIds)
    const drafts = allDrafts.filter(draft => selectedIdSet.has(draft.id))
    if (drafts.length !== draftIds.length) {
      throw new Error(
        'One or more pending drafts were removed or already published. Refresh and try again.'
      )
    }
    const isAdmin = (actor?.roles || []).includes('ADMIN')
    for (const draft of drafts) {
      const isOwnLecturerEvent =
        draft.kind === 'timetable' &&
        Number(draft.createdBy) === Number(actor?.id) &&
        (actor?.roles || []).includes('LECTURER')
      if (!isAdmin && !isOwnLecturerEvent) {
        throw new Error(
          'You are not allowed to publish one or more selected drafts.'
        )
      }
      assertNoStagedDraftConflict(
        draft,
        allDrafts.filter(other => other.id !== draft.id)
      )
    }
    const published = []
    for (const draft of drafts) {
      const payload = draft?.payload || {}
      if (draft.kind === 'timetable') {
        const lecturerId = Number(get(payload, 'lecturer_id', 'lecturerId'))
        if ((actor?.roles || []).includes('LECTURER')) {
          const [rows] = await connection.execute(
            'SELECT user_id FROM lecturers WHERE id = ?',
            [lecturerId]
          )
          if (Number(rows[0]?.user_id) !== Number(actor.id))
            throw new Error(
              'Lecturers may only publish their own timetable events.'
            )
        }
        await assertNoTimetableConflict(connection, payload)
        const [result] = await connection.execute(
          `INSERT INTO timetable_entries
          (academic_year_id, semester_id, unit_id, cohort_id, lecturer_id, venue_id,
           day_of_week, start_time, end_time, event_type, status, created_by, updated_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SCHEDULED', ?, ?)`,
          [
            Number(get(payload, 'academic_year_id', 'academicYearId')),
            Number(get(payload, 'semester_id', 'semesterId')),
            Number(get(payload, 'course_id', 'courseId')),
            Number((get(payload, 'cohort_ids', 'cohortIds') || [])[0]),
            lecturerId,
            Number(get(payload, 'venue_id', 'venueId')),
            get(payload, 'day_of_week', 'dayOfWeek'),
            get(payload, 'start_time', 'startTime'),
            get(payload, 'end_time', 'endTime'),
            get(payload, 'event_type', 'eventType') || 'LECTURE',
            actor.id,
            actor.id
          ]
        )
        const eventId = result.insertId
        for (const programmeId of (
          get(payload, 'programme_ids', 'programmeIds') || []
        )
          .map(Number)
          .filter(Boolean)) {
          await connection.execute(
            'INSERT INTO timetable_entry_programmes (timetable_entry_id, programme_id) VALUES (?, ?)',
            [eventId, programmeId]
          )
        }
        for (const cohortId of (get(payload, 'cohort_ids', 'cohortIds') || [])
          .map(Number)
          .filter(Boolean)) {
          await connection.execute(
            'INSERT INTO timetable_entry_cohorts (timetable_entry_id, cohort_id) VALUES (?, ?)',
            [eventId, cohortId]
          )
        }
        published.push({ kind: draft.kind, id: eventId })
        await connection.execute(
          `INSERT INTO audit_logs
          (user_id, action, entity_type, entity_id, new_values)
          VALUES (?, 'PUBLISH_SCHEDULE_ITEM', 'timetable_entry', ?, ?)`,
          [
            actor.id,
            eventId,
            JSON.stringify({ ...payload, status: 'SCHEDULED' })
          ]
        )
      } else if (draft.kind === 'exam_update') {
        if (!(actor?.roles || []).includes('ADMIN')) {
          throw new Error('Only administrators may publish exam edits.')
        }
        const examId = Number(payload.exam_id ?? payload.examId)
        if (!examId) throw new Error('The exam edit is missing its exam ID.')
        const [existingRows] = await connection.execute(
          'SELECT * FROM exams WHERE id = ? FOR UPDATE',
          [examId]
        )
        if (!existingRows.length) throw new Error('The exam no longer exists.')
        if (existingRows[0].status !== 'SCHEDULED') {
          throw new Error('Only scheduled exams can be edited and published.')
        }

        const examDate = String(
          get(payload, 'exam_date', 'examDate') || ''
        ).slice(0, 10)
        const examStart = get(payload, 'start_time', 'startTime')
        const examEnd = get(payload, 'end_time', 'endTime')
        const durationMinutes = Number(
          get(payload, 'duration_minutes', 'durationMinutes')
        )
        if (
          !/^\d{4}-\d{2}-\d{2}$/.test(examDate) ||
          !examStart ||
          !examEnd ||
          String(examStart).slice(0, 5) >= String(examEnd).slice(0, 5) ||
          durationMinutes < 1
        ) {
          throw new Error(
            'The exam needs a valid date, duration, and time range.'
          )
        }
        const [todayRows] = await connection.execute(
          "SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS today, DATE_FORMAT(CURTIME(), '%H:%i') AS current_time"
        )
        if (examDate < String(todayRows[0]?.today || '')) {
          throw new Error('Exam date cannot be in the past.')
        }
        if (
          examDate === todayRows[0]?.today &&
          String(examStart).slice(0, 5) <= todayRows[0]?.current_time
        ) {
          throw new Error(
            'Exam start time must be later than the current time.'
          )
        }

        const academicYearId = Number(
          get(payload, 'academic_year_id', 'academicYearId')
        )
        const semesterId = Number(get(payload, 'semester_id', 'semesterId'))
        const courseId = Number(get(payload, 'course_id', 'courseId'))
        const [academicRows, semesterRows, unitRows] = await Promise.all([
          run(connection, 'SELECT id FROM academic_years WHERE id = ?', [
            academicYearId
          ]),
          run(
            connection,
            'SELECT id FROM semesters WHERE id = ? AND academic_year_id = ?',
            [semesterId, academicYearId]
          ),
          run(connection, 'SELECT id FROM units WHERE id = ?', [courseId])
        ])
        if (!academicRows.length || !semesterRows.length || !unitRows.length) {
          throw new Error(
            'The exam academic year, semester, or unit is invalid.'
          )
        }

        const cohortAllocations = payload.cohort_allocations || []
        const venueAllocations = payload.venue_allocations || []
        const cohortIds = cohortAllocations
          .map(item => Number(get(item, 'cohort_id', 'cohortId')))
          .filter(Boolean)
        if (
          !cohortIds.length ||
          cohortIds.length !== cohortAllocations.length ||
          new Set(cohortIds).size !== cohortIds.length ||
          !venueAllocations.length
        ) {
          throw new Error(
            'Exam edits need unique cohort allocations and at least one venue.'
          )
        }
        const cohortStudentTotal = cohortAllocations.reduce(
          (total, item) =>
            total + Number(get(item, 'student_count', 'studentCount') || 0),
          0
        )
        const venueStudentTotal = venueAllocations.reduce(
          (total, item) =>
            total + Number(get(item, 'student_count', 'studentCount') || 0),
          0
        )
        if (
          cohortAllocations.some(
            item => Number(get(item, 'student_count', 'studentCount') || 0) < 1
          ) ||
          venueStudentTotal < cohortStudentTotal
        ) {
          throw new Error(
            'Venue allocations must cover all students in the selected cohorts.'
          )
        }

        const nextExam = {
          academic_year_id: academicYearId,
          semester_id: semesterId,
          course_id: courseId,
          exam_date: examDate,
          start_time: examStart,
          end_time: examEnd,
          duration_minutes: durationMinutes
        }
        await assertNoExamConflict(
          connection,
          nextExam,
          cohortIds,
          venueAllocations,
          examId
        )
        const [beforeCohorts] = await connection.execute(
          'SELECT cohort_id, student_count FROM exam_cohorts WHERE exam_id = ?',
          [examId]
        )
        const [beforeVenues] = await connection.execute(
          'SELECT venue_id, allocated_capacity, student_count FROM exam_venue_allocations WHERE exam_id = ?',
          [examId]
        )
        await connection.execute(
          `UPDATE exams SET academic_year_id = ?, semester_id = ?, unit_id = ?,
           exam_date = ?, start_time = ?, end_time = ?, duration_minutes = ?,
           instructions = ?, updated_by = ? WHERE id = ?`,
          [
            academicYearId,
            semesterId,
            courseId,
            examDate,
            examStart,
            examEnd,
            durationMinutes,
            payload.instructions || '',
            actor.id,
            examId
          ]
        )
        await connection.execute('DELETE FROM exam_cohorts WHERE exam_id = ?', [
          examId
        ])
        await connection.execute(
          'DELETE FROM exam_venue_allocations WHERE exam_id = ?',
          [examId]
        )
        for (const item of cohortAllocations) {
          await connection.execute(
            'INSERT INTO exam_cohorts (exam_id, cohort_id, student_count) VALUES (?, ?, ?)',
            [
              examId,
              Number(get(item, 'cohort_id', 'cohortId')),
              Number(get(item, 'student_count', 'studentCount'))
            ]
          )
        }
        for (const item of venueAllocations) {
          await connection.execute(
            'INSERT INTO exam_venue_allocations (exam_id, venue_id, allocated_capacity, student_count) VALUES (?, ?, ?, ?)',
            [
              examId,
              Number(get(item, 'venue_id', 'venueId')),
              Number(get(item, 'allocated_capacity', 'allocatedCapacity')),
              Number(get(item, 'student_count', 'studentCount'))
            ]
          )
        }
        published.push({ kind: draft.kind, id: examId })
        await connection.execute(
          `INSERT INTO audit_logs
          (user_id, action, entity_type, entity_id, old_values, new_values)
          VALUES (?, 'PUBLISH_EXAM_EDIT', 'exam', ?, ?, ?)`,
          [
            actor.id,
            examId,
            JSON.stringify({
              ...existingRows[0],
              cohort_allocations: beforeCohorts,
              venue_allocations: beforeVenues
            }),
            JSON.stringify({
              ...nextExam,
              instructions: payload.instructions || '',
              cohort_allocations: cohortAllocations,
              venue_allocations: venueAllocations
            })
          ]
        )
      } else if (draft.kind === 'timetable_update') {
        if (!(actor?.roles || []).includes('ADMIN')) {
          throw new Error('Only administrators may publish timetable edits.')
        }
        const entryId = Number(
          payload.timetable_entry_id ?? payload.timetableEntryId
        )
        if (!entryId)
          throw new Error('The timetable edit is missing its event.')
        const [existingRows] = await connection.execute(
          'SELECT * FROM timetable_entries WHERE id = ? FOR UPDATE',
          [entryId]
        )
        if (!existingRows.length)
          throw new Error('The timetable event no longer exists.')

        const cohortIds = (get(payload, 'cohort_ids', 'cohortIds') || [])
          .map(Number)
          .filter(Boolean)
        const programmeIds = (
          get(payload, 'programme_ids', 'programmeIds') || []
        )
          .map(Number)
          .filter(Boolean)
        if (!cohortIds.length || !programmeIds.length) {
          throw new Error(
            'A timetable edit needs at least one cohort and programme.'
          )
        }

        await assertNoTimetableConflict(connection, payload, entryId)
        const [beforeCohorts] = await connection.execute(
          'SELECT cohort_id FROM timetable_entry_cohorts WHERE timetable_entry_id = ?',
          [entryId]
        )
        const [beforeProgrammes] = await connection.execute(
          'SELECT programme_id FROM timetable_entry_programmes WHERE timetable_entry_id = ?',
          [entryId]
        )
        const nextValues = {
          academic_year_id: Number(
            get(payload, 'academic_year_id', 'academicYearId')
          ),
          semester_id: Number(get(payload, 'semester_id', 'semesterId')),
          unit_id: Number(get(payload, 'course_id', 'courseId')),
          cohort_id: cohortIds[0],
          lecturer_id: Number(get(payload, 'lecturer_id', 'lecturerId')),
          venue_id: Number(get(payload, 'venue_id', 'venueId')),
          day_of_week: get(payload, 'day_of_week', 'dayOfWeek'),
          start_time: get(payload, 'start_time', 'startTime'),
          end_time: get(payload, 'end_time', 'endTime'),
          event_type: get(payload, 'event_type', 'eventType') || 'LECTURE',
          status: 'SCHEDULED',
          updated_by: actor.id
        }
        await connection.execute(
          `UPDATE timetable_entries SET academic_year_id = ?, semester_id = ?,
           unit_id = ?, cohort_id = ?, lecturer_id = ?, venue_id = ?,
           day_of_week = ?, start_time = ?, end_time = ?, event_type = ?,
           status = ?, updated_by = ? WHERE id = ?`,
          [
            nextValues.academic_year_id,
            nextValues.semester_id,
            nextValues.unit_id,
            nextValues.cohort_id,
            nextValues.lecturer_id,
            nextValues.venue_id,
            nextValues.day_of_week,
            nextValues.start_time,
            nextValues.end_time,
            nextValues.event_type,
            nextValues.status,
            nextValues.updated_by,
            entryId
          ]
        )
        await connection.execute(
          'DELETE FROM timetable_entry_cohorts WHERE timetable_entry_id = ?',
          [entryId]
        )
        await connection.execute(
          'DELETE FROM timetable_entry_programmes WHERE timetable_entry_id = ?',
          [entryId]
        )
        for (const cohortId of [...new Set(cohortIds)]) {
          await connection.execute(
            'INSERT INTO timetable_entry_cohorts (timetable_entry_id, cohort_id) VALUES (?, ?)',
            [entryId, cohortId]
          )
        }
        for (const programmeId of [...new Set(programmeIds)]) {
          await connection.execute(
            'INSERT INTO timetable_entry_programmes (timetable_entry_id, programme_id) VALUES (?, ?)',
            [entryId, programmeId]
          )
        }
        published.push({ kind: draft.kind, id: entryId })
        await connection.execute(
          `INSERT INTO audit_logs
          (user_id, action, entity_type, entity_id, old_values, new_values)
          VALUES (?, 'PUBLISH_TIMETABLE_EDIT', 'timetable_entry', ?, ?, ?)`,
          [
            actor.id,
            entryId,
            JSON.stringify({
              ...existingRows[0],
              cohort_ids: beforeCohorts.map(row => row.cohort_id),
              programme_ids: beforeProgrammes.map(row => row.programme_id)
            }),
            JSON.stringify({
              ...nextValues,
              cohort_ids: [...new Set(cohortIds)],
              programme_ids: [...new Set(programmeIds)]
            })
          ]
        )
      } else if (draft.kind === 'exam') {
        if (!(actor?.roles || []).includes('ADMIN'))
          throw new Error('Only administrators may publish exams.')
        const cohortAllocations = payload.cohort_allocations || []
        const venueAllocations = payload.venue_allocations || []
        const examDate = String(
          get(payload, 'exam_date', 'examDate') || ''
        ).slice(0, 10)
        const examStart = get(payload, 'start_time', 'startTime')
        const examEnd = get(payload, 'end_time', 'endTime')
        if (
          !/^\d{4}-\d{2}-\d{2}$/.test(examDate) ||
          !examStart ||
          !examEnd ||
          String(examStart) >= String(examEnd) ||
          Number(get(payload, 'duration_minutes', 'durationMinutes')) < 1
        ) {
          throw new Error(
            'The exam needs a valid date, duration, and time range.'
          )
        }
        const [todayRows] = await connection.execute(
          "SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS today"
        )
        if (examDate < String(todayRows[0]?.today || ''))
          throw new Error('Exam date cannot be in the past.')
        if (examDate === todayRows[0]?.today) {
          const [clockRows] = await connection.execute(
            "SELECT DATE_FORMAT(CURTIME(), '%H:%i') AS current_time"
          )
          if (
            String(examStart).slice(0, 5) <=
            String(clockRows[0]?.current_time || '')
          ) {
            throw new Error(
              'Exam start time must be later than the current time.'
            )
          }
        }
        const [academicRows, semesterRows, unitRows] = await Promise.all([
          run(connection, 'SELECT id FROM academic_years WHERE id = ?', [
            Number(get(payload, 'academic_year_id', 'academicYearId'))
          ]),
          run(
            connection,
            'SELECT id FROM semesters WHERE id = ? AND academic_year_id = ?',
            [
              Number(get(payload, 'semester_id', 'semesterId')),
              Number(get(payload, 'academic_year_id', 'academicYearId'))
            ]
          ),
          run(connection, 'SELECT id FROM units WHERE id = ?', [
            Number(get(payload, 'course_id', 'courseId'))
          ])
        ])
        if (!academicRows.length || !semesterRows.length || !unitRows.length)
          throw new Error(
            'The exam academic year, semester, or unit is invalid.'
          )
        const cohortIds = cohortAllocations
          .map(item => Number(get(item, 'cohort_id', 'cohortId')))
          .filter(Boolean)
        if (!cohortIds.length || !venueAllocations.length)
          throw new Error(
            'Each exam needs at least one cohort and venue allocation.'
          )
        const cohortStudentTotal = cohortAllocations.reduce(
          (total, item) =>
            total + Number(get(item, 'student_count', 'studentCount') || 0),
          0
        )
        const venueStudentTotal = venueAllocations.reduce(
          (total, item) =>
            total + Number(get(item, 'student_count', 'studentCount') || 0),
          0
        )
        if (venueStudentTotal < cohortStudentTotal) {
          throw new Error(
            `Venue allocations cover ${venueStudentTotal} students, but the selected cohorts contain ${cohortStudentTotal}.`
          )
        }
        await assertNoExamConflict(
          connection,
          payload,
          cohortIds,
          venueAllocations
        )
        const [result] = await connection.execute(
          `INSERT INTO exams
          (academic_year_id, semester_id, unit_id, exam_date, start_time, end_time,
           duration_minutes, status, instructions, created_by, updated_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'SCHEDULED', ?, ?, ?)`,
          [
            Number(get(payload, 'academic_year_id', 'academicYearId')),
            Number(get(payload, 'semester_id', 'semesterId')),
            Number(get(payload, 'course_id', 'courseId')),
            String(get(payload, 'exam_date', 'examDate')).slice(0, 10),
            get(payload, 'start_time', 'startTime'),
            get(payload, 'end_time', 'endTime'),
            Number(get(payload, 'duration_minutes', 'durationMinutes')),
            payload.instructions || '',
            actor.id,
            actor.id
          ]
        )
        const examId = result.insertId
        for (const item of cohortAllocations) {
          const count = Number(get(item, 'student_count', 'studentCount'))
          if (count < 1)
            throw new Error(
              'Each exam cohort allocation must include at least one student.'
            )
          await connection.execute(
            'INSERT INTO exam_cohorts (exam_id, cohort_id, student_count) VALUES (?, ?, ?)',
            [examId, Number(get(item, 'cohort_id', 'cohortId')), count]
          )
        }
        for (const item of venueAllocations) {
          await connection.execute(
            'INSERT INTO exam_venue_allocations (exam_id, venue_id, allocated_capacity, student_count) VALUES (?, ?, ?, ?)',
            [
              examId,
              Number(get(item, 'venue_id', 'venueId')),
              Number(get(item, 'allocated_capacity', 'allocatedCapacity')),
              Number(get(item, 'student_count', 'studentCount'))
            ]
          )
        }
        published.push({ kind: draft.kind, id: examId })
        await connection.execute(
          `INSERT INTO audit_logs
          (user_id, action, entity_type, entity_id, new_values)
          VALUES (?, 'PUBLISH_SCHEDULE_ITEM', 'exam', ?, ?)`,
          [
            actor.id,
            examId,
            JSON.stringify({ ...payload, status: 'SCHEDULED' })
          ]
        )
      } else {
        throw new Error('Unknown pending schedule item type.')
      }
    }
    await connection.execute(
      `DELETE FROM schedule_drafts WHERE id IN (${draftIds
        .map(() => '?')
        .join(',')})`,
      draftIds
    )
    await connection.commit()
    return published
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}
