import {
  createRow,
  findById,
  listRows,
  query
} from '../../repositories/sqlRepository.js'
import db from '../../config/db.js'

const toMinutes = value => {
  if (!value) return 0
  const [hours, minutes] = String(value).split(':').map(Number)
  return hours * 60 + minutes
}

const overlaps = (startA, endA, startB, endB) => startA < endB && endA > startB

const normalizedWeekday = value => {
  const normalized = String(value || '')
    .slice(0, 3)
    .toUpperCase()
  return normalized
}

const weekdayForDate = value => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''))
  if (!match) return ''
  return ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][
    new Date(
      Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    ).getUTCDay()
  ]
}

const normalizeAllocation = allocation => ({
  id: allocation.id ?? Date.now(),
  examId: Number(allocation.examId ?? allocation.exam_id),
  venueId: Number(allocation.venueId ?? allocation.venue_id),
  allocatedCapacity: Number(
    allocation.allocatedCapacity ?? allocation.allocated_capacity ?? 0
  ),
  studentCount: Number(
    allocation.studentCount ?? allocation.student_count ?? 0
  ),
  examDate: allocation.examDate ?? allocation.exam_date,
  startTime: allocation.startTime ?? allocation.start_time,
  endTime: allocation.endTime ?? allocation.end_time
})

export const createExam = async payload => {
  const academicYearId = payload.academicYearId ?? payload.academic_year_id
  const semesterId = payload.semesterId ?? payload.semester_id
  const courseId = payload.courseId ?? payload.course_id
  const examDate = payload.examDate ?? payload.exam_date
  const startTime = payload.startTime ?? payload.start_time
  const endTime = payload.endTime ?? payload.end_time
  const durationMinutes = payload.durationMinutes ?? payload.duration_minutes
  const statusValue = payload.status ?? 'SCHEDULED'
  const instructionsValue = payload.instructions ?? ''

  if (
    !academicYearId ||
    !semesterId ||
    !courseId ||
    !examDate ||
    !startTime ||
    !endTime ||
    !durationMinutes
  ) {
    return {
      valid: false,
      conflicts: [
        { type: 'VALIDATION_ERROR', message: 'Exam fields are incomplete.' }
      ]
    }
  }

  const today = new Date().toISOString().slice(0, 10)
  if (String(examDate).slice(0, 10) < today) {
    return {
      valid: false,
      conflicts: [
        {
          type: 'VALIDATION_ERROR',
          message: 'Exam date cannot be in the past.'
        }
      ]
    }
  }

  if (String(examDate).slice(0, 10) === today) {
    const currentTime = new Date().toTimeString().slice(0, 5)
    if (String(startTime).slice(0, 5) <= currentTime) {
      return {
        valid: false,
        conflicts: [
          {
            type: 'VALIDATION_ERROR',
            message: 'Exam start time must be later than the current time.'
          }
        ]
      }
    }
  }

  const existingUnitExam = await query(
    `SELECT e.start_time, e.end_time, u.code, u.name
     FROM exams e
    LEFT JOIN units u ON u.id = e.unit_id
    WHERE e.unit_id = ?
       AND e.exam_date = ?
       AND e.start_time < ?
       AND e.end_time > ?
     LIMIT 1`,
    [courseId, examDate, endTime, startTime]
  )
  if (existingUnitExam[0]) {
    const unitLabel = existingUnitExam[0].code
      ? `${existingUnitExam[0].code} - ${existingUnitExam[0].name}`
      : `Unit ${courseId}`
    return {
      valid: false,
      conflicts: [
        {
          type: 'EXAM_UNIT_CONFLICT',
          message: `${unitLabel} already has an overlapping exam from ${existingUnitExam[0].start_time} to ${existingUnitExam[0].end_time}.`
        }
      ]
    }
  }

  const cohortAllocations = Array.isArray(payload.cohort_allocations)
    ? payload.cohort_allocations
    : []
  for (const allocation of cohortAllocations) {
    const cohortId = Number(allocation.cohortId ?? allocation.cohort_id)
    if (!cohortId) continue
    const cohort = await findById('cohorts', cohortId)
    const existing = await query(
      `SELECT e.start_time, e.end_time
       FROM exam_cohorts ec
       JOIN exams e ON e.id = ec.exam_id
       WHERE ec.cohort_id = ?
         AND e.exam_date = ?
         AND e.start_time < ?
         AND e.end_time > ?
       LIMIT 1`,
      [cohortId, examDate, endTime, startTime]
    )
    if (existing[0]) {
      return {
        valid: false,
        conflicts: [
          {
            type: 'EXAM_COHORT_CONFLICT',
            message: `${
              cohort?.name || `Cohort ${cohortId}`
            } already has an exam scheduled from ${existing[0].start_time} to ${
              existing[0].end_time
            }.`
          }
        ]
      }
    }
  }

  const venueAllocations = Array.isArray(payload.venue_allocations)
    ? payload.venue_allocations
    : []
  for (const allocation of venueAllocations) {
    const venueId = Number(allocation.venueId ?? allocation.venue_id)
    const venue = await findById('venues', venueId)
    const allocatedCapacity = Number(
      allocation.allocatedCapacity ?? allocation.allocated_capacity
    )
    if (venue && allocatedCapacity > Number(venue.capacity)) {
      return {
        valid: false,
        conflicts: [
          {
            type: 'VENUE_CAPACITY_EXCEEDED',
            message: `${venue.name} cannot allocate more than ${venue.capacity} students.`
          }
        ]
      }
    }
    const scheduledEntries = await query(
      `SELECT id, day_of_week, start_time, end_time
       FROM timetable_entries
       WHERE venue_id = ? AND status = 'SCHEDULED'
         AND start_time < ? AND end_time > ?`,
      [venueId, endTime, startTime]
    )
    const recurringVenueConflict = scheduledEntries.find(
      entry => normalizedWeekday(entry.day_of_week) === weekdayForDate(examDate)
    )
    if (recurringVenueConflict) {
      return {
        valid: false,
        conflicts: [
          {
            type: 'EXAM_VENUE_CONFLICT',
            message: `${
              venue?.name || `Venue ${venueId}`
            } already has a scheduled ${
              recurringVenueConflict.day_of_week
            } event from ${recurringVenueConflict.start_time} to ${
              recurringVenueConflict.end_time
            }.`
          }
        ]
      }
    }
    const existing = await query(
      `SELECT e.start_time, e.end_time
       FROM exam_venue_allocations eva
       JOIN exams e ON e.id = eva.exam_id
       WHERE eva.venue_id = ?
         AND e.exam_date = ?
         AND e.start_time < ?
         AND e.end_time > ?
       LIMIT 1`,
      [venueId, examDate, endTime, startTime]
    )
    if (existing[0]) {
      return {
        valid: false,
        conflicts: [
          {
            type: 'EXAM_VENUE_CONFLICT',
            message: `${
              venue?.name || `Venue ${venueId}`
            } is already booked for an exam from ${existing[0].start_time} to ${
              existing[0].end_time
            }.`
          }
        ]
      }
    }
  }

  const exam = await createRow('exams', {
    academic_year_id: Number(academicYearId),
    semester_id: Number(semesterId),
    unit_id: Number(courseId),
    exam_date: examDate,
    start_time: startTime,
    end_time: endTime,
    duration_minutes: Number(durationMinutes),
    status: statusValue,
    instructions: instructionsValue,
    created_by: 1,
    updated_by: 1
  })

  return {
    valid: true,
    data: exam
  }
}

export const updateExam = async (id, payload) => {
  const academicYearId = payload.academicYearId ?? payload.academic_year_id
  const semesterId = payload.semesterId ?? payload.semester_id
  const courseId = payload.courseId ?? payload.course_id
  const examDate = payload.examDate ?? payload.exam_date
  const startTime = payload.startTime ?? payload.start_time
  const endTime = payload.endTime ?? payload.end_time
  const durationMinutes = payload.durationMinutes ?? payload.duration_minutes
  if (
    !academicYearId ||
    !semesterId ||
    !courseId ||
    !examDate ||
    !startTime ||
    !endTime ||
    !durationMinutes
  ) {
    return {
      valid: false,
      conflicts: [
        { type: 'VALIDATION_ERROR', message: 'Exam fields are incomplete.' }
      ]
    }
  }
  const cohortAllocations = payload.cohort_allocations || []
  const venueAllocations = payload.venue_allocations || []
  if (!cohortAllocations.length || !venueAllocations.length) {
    return {
      valid: false,
      conflicts: [
        {
          type: 'VALIDATION_ERROR',
          message: 'An exam needs at least one cohort and venue allocation.'
        }
      ]
    }
  }

  const connection = await db.getConnection()
  try {
    await connection.beginTransaction()
    const [existingExam] = await connection.execute(
      'SELECT id FROM exams WHERE id = ? FOR UPDATE',
      [id]
    )
    if (!existingExam.length) {
      await connection.rollback()
      return {
        valid: false,
        conflicts: [{ type: 'NOT_FOUND', message: 'Exam not found.' }]
      }
    }

    const date = String(examDate).slice(0, 10)
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      String(startTime).slice(0, 5) >= String(endTime).slice(0, 5) ||
      Number(durationMinutes) < 1
    ) {
      throw new Error('The exam needs a valid date, duration, and time range.')
    }
    const [clockRows] = await connection.execute(
      "SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS today, DATE_FORMAT(CURTIME(), '%H:%i') AS current_time"
    )
    if (date < String(clockRows[0]?.today || ''))
      throw new Error('Exam date cannot be in the past.')
    if (
      date === clockRows[0]?.today &&
      String(startTime).slice(0, 5) <= clockRows[0]?.current_time
    ) {
      throw new Error('Exam start time must be later than the current time.')
    }
    const cohortIds = cohortAllocations
      .map(item => Number(item.cohortId ?? item.cohort_id))
      .filter(Boolean)
    const venueIds = venueAllocations
      .map(item => Number(item.venueId ?? item.venue_id))
      .filter(Boolean)
    if (
      cohortIds.length !== cohortAllocations.length ||
      new Set(cohortIds).size !== cohortIds.length
    ) {
      throw new Error('Each cohort can only be added once to an exam.')
    }
    if (
      venueIds.length !== venueAllocations.length ||
      new Set(venueIds).size !== venueIds.length
    ) {
      throw new Error('Each venue can only be added once to an exam.')
    }
    const cohortStudentTotal = cohortAllocations.reduce(
      (total, allocation) =>
        total +
        Number(allocation.studentCount ?? allocation.student_count ?? 0),
      0
    )
    const venueStudentTotal = venueAllocations.reduce(
      (total, allocation) =>
        total +
        Number(allocation.studentCount ?? allocation.student_count ?? 0),
      0
    )
    if (
      cohortAllocations.some(
        allocation =>
          Number(allocation.studentCount ?? allocation.student_count ?? 0) < 1
      ) ||
      venueStudentTotal < cohortStudentTotal
    ) {
      throw new Error(
        'Venue allocations must cover all students in the selected cohorts.'
      )
    }
    const [changedUnit] = await connection.execute(
      `SELECT id FROM exams WHERE status = 'SCHEDULED' AND unit_id = ? AND exam_date = ?
       AND start_time < ? AND end_time > ? AND id <> ? LIMIT 1`,
      [courseId, date, endTime, startTime, id]
    )
    if (changedUnit.length)
      throw new Error('This unit already has an overlapping exam on that date.')

    for (const cohortId of cohortIds) {
      const [rows] = await connection.execute(
        `SELECT e.id FROM exams e
        JOIN exam_cohorts ec ON ec.exam_id = e.id
        WHERE e.status = 'SCHEDULED' AND ec.cohort_id = ? AND e.id <> ? AND e.exam_date = ?
          AND e.start_time < ? AND e.end_time > ? LIMIT 1`,
        [cohortId, id, date, endTime, startTime]
      )
      if (rows.length)
        throw new Error(
          'A selected cohort already has an overlapping exam on that date.'
        )
    }

    const weekday = weekdayForDate(date)
    if (cohortIds.length) {
      const cohortPlaceholders = cohortIds.map(() => '?').join(',')
      const [cohortTimetableRows] = await connection.execute(
        `SELECT te.id FROM timetable_entries te
          LEFT JOIN timetable_entry_cohorts tec ON tec.timetable_entry_id = te.id
          WHERE te.status = 'SCHEDULED'
            AND LEFT(UPPER(te.day_of_week), 3) = ?
            AND te.start_time < ? AND te.end_time > ?
            AND NOT EXISTS (
              SELECT 1 FROM schedule_overrides so
              WHERE so.timetable_entry_id = te.id
                AND so.effective_date = ? AND so.status = 'APPROVED'
            )
            AND (te.cohort_id IN (${cohortPlaceholders})
              OR tec.cohort_id IN (${cohortPlaceholders}))
          LIMIT 1`,
        [weekday, endTime, startTime, date, ...cohortIds, ...cohortIds]
      )
      if (cohortTimetableRows.length)
        throw new Error(
          'A selected cohort has a recurring timetable event during this exam.'
        )
      const [cohortOverrideRows] = await connection.execute(
        `SELECT te.id FROM schedule_overrides so
          JOIN timetable_entries te ON te.id = so.timetable_entry_id
          LEFT JOIN timetable_entry_cohorts tec ON tec.timetable_entry_id = te.id
          WHERE so.status = 'APPROVED' AND so.effective_date = ?
            AND so.new_start_time < ? AND so.new_end_time > ?
            AND (te.cohort_id IN (${cohortPlaceholders})
              OR tec.cohort_id IN (${cohortPlaceholders}))
          LIMIT 1`,
        [date, endTime, startTime, ...cohortIds, ...cohortIds]
      )
      if (cohortOverrideRows.length)
        throw new Error(
          'A selected cohort has a make-up class during this exam.'
        )
    }

    for (const allocation of venueAllocations) {
      const venueId = Number(allocation.venueId ?? allocation.venue_id)
      const capacity = Number(
        allocation.allocatedCapacity ?? allocation.allocated_capacity
      )
      const studentCount = Number(
        allocation.studentCount ?? allocation.student_count ?? capacity
      )
      const [venueRows] = await connection.execute(
        'SELECT capacity FROM venues WHERE id = ?',
        [venueId]
      )
      if (
        !venueRows.length ||
        capacity < 1 ||
        capacity > Number(venueRows[0].capacity) ||
        studentCount < 1 ||
        studentCount > capacity
      ) {
        throw new Error('A venue allocation is invalid or exceeds capacity.')
      }
      const [recurring] = await connection.execute(
        `SELECT te.id FROM timetable_entries te
        WHERE te.status = 'SCHEDULED' AND te.venue_id = ? AND LEFT(UPPER(te.day_of_week), 3) = ?
          AND te.start_time < ? AND te.end_time > ?
          AND NOT EXISTS (
            SELECT 1 FROM schedule_overrides so
            WHERE so.timetable_entry_id = te.id
              AND so.effective_date = ? AND so.status = 'APPROVED'
          ) LIMIT 1`,
        [venueId, weekday, endTime, startTime, date]
      )
      const [venueOverride] = await connection.execute(
        `SELECT id FROM schedule_overrides
        WHERE status = 'APPROVED' AND effective_date = ? AND new_venue_id = ?
          AND new_start_time < ? AND new_end_time > ? LIMIT 1`,
        [date, venueId, endTime, startTime]
      )
      const [otherExam] = await connection.execute(
        `SELECT e.id FROM exams e
        JOIN exam_venue_allocations eva ON eva.exam_id = e.id
        WHERE e.id <> ? AND e.status = 'SCHEDULED' AND eva.venue_id = ? AND e.exam_date = ?
          AND e.start_time < ? AND e.end_time > ? LIMIT 1`,
        [id, venueId, date, endTime, startTime]
      )
      if (recurring.length || venueOverride.length || otherExam.length)
        throw new Error('A selected venue is already occupied during the exam.')
    }

    await connection.execute(
      `UPDATE exams SET academic_year_id = ?, semester_id = ?, unit_id = ?,
      exam_date = ?, start_time = ?, end_time = ?, duration_minutes = ?, instructions = ?, updated_by = ?
      WHERE id = ?`,
      [
        Number(academicYearId),
        Number(semesterId),
        Number(courseId),
        date,
        startTime,
        endTime,
        Number(durationMinutes),
        payload.instructions ?? '',
        payload.updated_by ?? null,
        id
      ]
    )
    await connection.execute('DELETE FROM exam_cohorts WHERE exam_id = ?', [id])
    await connection.execute(
      'DELETE FROM exam_venue_allocations WHERE exam_id = ?',
      [id]
    )
    for (const allocation of cohortAllocations) {
      await connection.execute(
        'INSERT INTO exam_cohorts (exam_id, cohort_id, student_count) VALUES (?, ?, ?)',
        [
          id,
          Number(allocation.cohortId ?? allocation.cohort_id),
          Number(allocation.studentCount ?? allocation.student_count)
        ]
      )
    }
    for (const allocation of venueAllocations) {
      const capacity = Number(
        allocation.allocatedCapacity ?? allocation.allocated_capacity
      )
      await connection.execute(
        'INSERT INTO exam_venue_allocations (exam_id, venue_id, allocated_capacity, student_count) VALUES (?, ?, ?, ?)',
        [
          id,
          Number(allocation.venueId ?? allocation.venue_id),
          capacity,
          Number(
            allocation.studentCount ?? allocation.student_count ?? capacity
          )
        ]
      )
    }
    const [rows] = await connection.execute(
      'SELECT * FROM exams WHERE id = ?',
      [id]
    )
    await connection.commit()
    return { valid: true, data: rows[0] }
  } catch (error) {
    await connection.rollback()
    return {
      valid: false,
      conflicts: [{ type: 'EXAM_UPDATE_CONFLICT', message: error.message }]
    }
  } finally {
    connection.release()
  }
}

export const deleteExam = async (id, actor) => {
  const connection = await db.getConnection()
  try {
    await connection.beginTransaction()
    const [examRows] = await connection.execute(
      `SELECT e.*, u.code AS unit_code, u.name AS unit_name
      FROM exams e LEFT JOIN units u ON u.id = e.unit_id
       WHERE e.id = ? FOR UPDATE`,
      [Number(id)]
    )
    if (!examRows.length) {
      await connection.rollback()
      return null
    }
    const [cohortRows] = await connection.execute(
      `SELECT ec.cohort_id, c.name AS cohort_name, ec.student_count
       FROM exam_cohorts ec JOIN cohorts c ON c.id = ec.cohort_id
       WHERE ec.exam_id = ?`,
      [Number(id)]
    )
    const [venueRows] = await connection.execute(
      `SELECT eva.venue_id, v.name AS venue_name, eva.allocated_capacity,
        eva.student_count
       FROM exam_venue_allocations eva JOIN venues v ON v.id = eva.venue_id
       WHERE eva.exam_id = ?`,
      [Number(id)]
    )
    const exam = examRows[0]
    const oldValues = {
      ...exam,
      cohort_allocations: cohortRows,
      venue_allocations: venueRows
    }
    await connection.execute(
      `INSERT INTO audit_logs
       (user_id, action, entity_type, entity_id, old_values, reason)
       VALUES (?, 'DELETE', 'exam', ?, ?, 'Exam deleted by administrator')`,
      [Number(actor?.id) || null, Number(id), JSON.stringify(oldValues)]
    )
    await connection.execute('DELETE FROM exams WHERE id = ?', [Number(id)])
    await connection.commit()
    return {
      id: Number(id),
      unitCode: exam.unit_code,
      unitName: exam.unit_name
    }
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

export const createExamCohortAllocation = async ({
  examId,
  cohortId,
  studentCount
}) => {
  if (!examId || !cohortId || !studentCount) {
    return {
      valid: false,
      conflicts: [
        {
          type: 'VALIDATION_ERROR',
          message: 'Exam cohort allocation requires exam, cohort, and count.'
        }
      ]
    }
  }

  const exam = (
    await query(
      'SELECT exam_date, start_time, end_time FROM exams WHERE id = ?',
      [examId]
    )
  )[0]
  const cohort = await findById('cohorts', cohortId)
  if (exam) {
    const existing = await query(
      `SELECT ec.id, e.start_time, e.end_time
       FROM exam_cohorts ec
       JOIN exams e ON e.id = ec.exam_id
       WHERE ec.cohort_id = ?
         AND ec.exam_id <> ?
         AND e.exam_date = ?
         AND e.start_time < ?
         AND e.end_time > ?
       LIMIT 1`,
      [cohortId, examId, exam.exam_date, exam.end_time, exam.start_time]
    )
    if (existing[0]) {
      return {
        valid: false,
        conflicts: [
          {
            type: 'EXAM_COHORT_CONFLICT',
            message: `${
              cohort?.name || `Cohort ${cohortId}`
            } already has an exam scheduled from ${existing[0].start_time} to ${
              existing[0].end_time
            }.`
          }
        ]
      }
    }
  }

  const record = await createRow('exam_cohorts', {
    exam_id: Number(examId),
    cohort_id: Number(cohortId),
    student_count: Number(studentCount)
  })

  const response = {
    ...record,
    examId: Number(record.exam_id),
    cohortId: Number(record.cohort_id),
    studentCount: Number(record.student_count),
    createdAt: record.created_at
  }

  return { valid: true, data: response }
}

export const allocateExamVenue = async ({
  examId,
  venueId,
  allocatedCapacity,
  studentCount,
  examDate,
  startTime,
  endTime,
  examAllocations = [],
  allowCapacityOverride = false
}) => {
  if (!examId || !venueId || !allocatedCapacity || !studentCount) {
    return {
      valid: false,
      conflicts: [
        {
          type: 'VALIDATION_ERROR',
          message: 'Exam venue payload is incomplete.'
        }
      ]
    }
  }

  const venue = await findById('venues', venueId)
  if (!venue) {
    return {
      valid: false,
      conflicts: [
        { type: 'VALIDATION_ERROR', message: 'Selected venue was not found.' }
      ]
    }
  }

  if (
    !allowCapacityOverride &&
    Number(allocatedCapacity) > Number(venue.capacity)
  ) {
    return {
      valid: false,
      conflicts: [
        {
          type: 'VENUE_CAPACITY_EXCEEDED',
          message: `${venue.name} has a capacity of ${venue.capacity}.`
        }
      ]
    }
  }

  if (
    !allowCapacityOverride &&
    Number(studentCount) > Number(allocatedCapacity)
  ) {
    return {
      valid: false,
      conflicts: [
        {
          type: 'ALLOCATION_EXCEEDED',
          message:
            'Allocated students cannot exceed the venue allocation capacity.'
        }
      ]
    }
  }

  const fallback = examAllocations[0]
    ? normalizeAllocation(examAllocations[0])
    : null

  const candidate = normalizeAllocation({
    examId,
    venueId,
    allocatedCapacity,
    studentCount,
    examDate: examDate ?? fallback?.examDate,
    startTime: startTime ?? fallback?.startTime,
    endTime: endTime ?? fallback?.endTime
  })

  const existingRows = await query(`
    SELECT eva.*, e.exam_date, e.start_time, e.end_time
    FROM exam_venue_allocations eva
    JOIN exams e ON e.id = eva.exam_id
  `)
  const existingAllocations = [
    ...existingRows.map(item => normalizeAllocation(item)),
    ...examAllocations.map(item => normalizeAllocation(item))
  ]

  const overlap = existingAllocations.some(allocation => {
    if (!allocation.examDate || !allocation.startTime || !allocation.endTime)
      return false
    if (Number(allocation.examId) === Number(examId)) return false
    if (Number(allocation.venueId) !== Number(candidate.venueId)) return false
    if (allocation.examDate !== candidate.examDate) return false

    return overlaps(
      toMinutes(candidate.startTime),
      toMinutes(candidate.endTime),
      toMinutes(allocation.startTime),
      toMinutes(allocation.endTime)
    )
  })

  if (overlap) {
    const conflictingVenue = await findById('venues', candidate.venueId)
    return {
      valid: false,
      conflicts: [
        {
          type: 'EXAM_VENUE_CONFLICT',
          message: `${
            conflictingVenue?.name || `Venue ${candidate.venueId}`
          } is already allocated to an overlapping exam from ${
            candidate.startTime
          } to ${candidate.endTime}.`
        }
      ]
    }
  }

  const scheduledEntries = await query(
    `SELECT id, day_of_week, start_time, end_time
     FROM timetable_entries
     WHERE venue_id = ? AND status = 'SCHEDULED'
       AND start_time < ? AND end_time > ?`,
    [candidate.venueId, candidate.endTime, candidate.startTime]
  )
  const recurringVenueConflict = scheduledEntries.find(
    entry =>
      normalizedWeekday(entry.day_of_week) ===
      weekdayForDate(candidate.examDate)
  )
  if (recurringVenueConflict) {
    return {
      valid: false,
      conflicts: [
        {
          type: 'EXAM_VENUE_CONFLICT',
          message: `${venue.name} already has a scheduled ${recurringVenueConflict.day_of_week} event from ${recurringVenueConflict.start_time} to ${recurringVenueConflict.end_time}.`
        }
      ]
    }
  }

  const saved = await createRow('exam_venue_allocations', {
    exam_id: Number(examId),
    venue_id: Number(venueId),
    allocated_capacity: Number(allocatedCapacity),
    student_count: Number(studentCount)
  })

  return {
    valid: true,
    data: {
      ...saved,
      examId: Number(saved.exam_id),
      venueId: Number(saved.venue_id),
      allocatedCapacity: Number(saved.allocated_capacity),
      studentCount: Number(saved.student_count),
      examDate: candidate.examDate,
      startTime: candidate.startTime,
      endTime: candidate.endTime
    }
  }
}
