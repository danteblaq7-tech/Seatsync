import { validateTimetableEntry } from './conflictService.js'
import { emitSocketEvent } from '../../socket/socketEvents.js'
import {
  createRow,
  findById,
  query
} from '../../repositories/sqlRepository.js'
import db from '../../config/db.js'
import { createNotification } from '../notifications/notificationService.js'
import {
  removeReplacedTimetableEntries,
  weekdayNameFromDateOnly
} from '../scheduleOverrideAvailability.js'

export const createScheduleOverride = async ({
  timetableEntryId,
  effectiveDate,
  newVenueId,
  newStartTime,
  newEndTime,
  reason,
  status,
  createdBy,
  venueBlocks,
  requesterUserId,
  requesterRoles = []
}) => {
  const value = (camel, snake) =>
    timetableEntry?.[camel] ?? timetableEntry?.[snake]
  if (
    !timetableEntryId ||
    !effectiveDate ||
    !newVenueId ||
    !newStartTime ||
    !newEndTime ||
    !reason
  ) {
    return {
      valid: false,
      conflicts: [
        {
          type: 'VALIDATION_ERROR',
          message: 'Class, make-up date, venue, times, and reason are required.'
        }
      ]
    }
  }

  const dateParts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(effectiveDate))
  if (
    !dateParts ||
    new Date(
      Date.UTC(Number(dateParts[1]), Number(dateParts[2]) - 1, Number(dateParts[3]))
    )
      .toISOString()
      .slice(0, 10) !== effectiveDate
  ) {
    return {
      valid: false,
      conflicts: [
        {
          type: 'VALIDATION_ERROR',
          message: 'Enter a valid make-up date.'
        }
      ]
    }
  }
  const dateValidation = await query(
    'SELECT ? < CURRENT_DATE() AS is_past',
    [effectiveDate]
  )
  if (Number(dateValidation[0]?.is_past)) {
    return {
      valid: false,
      conflicts: [
        {
          type: 'VALIDATION_ERROR',
          message: 'A make-up class cannot be scheduled in the past.'
        }
      ]
    }
  }

  const timetableEntry = await findById('timetable_entries', timetableEntryId)
  if (!timetableEntry) {
    return {
      valid: false,
      conflicts: [{ type: 'VALIDATION_ERROR', message: 'Class not found.' }]
    }
  }
  const unit = await findById(
    'units',
    timetableEntry.unitId ?? timetableEntry.unit_id
  )

  const roles = Array.isArray(requesterRoles)
    ? requesterRoles
    : [requesterRoles]
  if (!roles.includes('ADMIN')) {
    const lecturer = await findById(
      'lecturers',
      value('lecturerId', 'lecturer_id')
    )
    if (
      !lecturer ||
      Number(lecturer.userId ?? lecturer.user_id) !== Number(requesterUserId)
    ) {
      return {
        valid: false,
        conflicts: [
          {
            type: 'FORBIDDEN',
            message: 'You can only reschedule your own classes.'
          }
        ]
      }
    }
  }

  if (String(newStartTime) >= String(newEndTime)) {
    return {
      valid: false,
      conflicts: [
        {
          type: 'VALIDATION_ERROR',
          message: 'The end time must be later than the start time.'
        }
      ]
    }
  }

  const existingOverride = await query(
    `SELECT id FROM schedule_overrides
     WHERE timetable_entry_id = ? AND effective_date = ? AND status = 'APPROVED'
     LIMIT 1`,
    [timetableEntryId, effectiveDate]
  )
  if (existingOverride.length) {
    return {
      valid: false,
      conflicts: [
        {
          type: 'VALIDATION_ERROR',
          message: 'This class already has a make-up arrangement for that date.'
        }
      ]
    }
  }

  const newVenue = await findById('venues', newVenueId)
  if (!newVenue || newVenue.status !== 'ACTIVE') {
    return {
      valid: false,
      conflicts: [
        { type: 'VALIDATION_ERROR', message: 'Select an active venue.' }
      ]
    }
  }
  const [studentCount] = await query(
    `SELECT COALESCE(NULLIF(SUM(c.student_count), 0),
       (SELECT student_count FROM cohorts WHERE id = ?), 0) AS total
     FROM timetable_entry_cohorts tec
     JOIN cohorts c ON c.id = tec.cohort_id
     WHERE tec.timetable_entry_id = ?`,
    [value('cohortId', 'cohort_id'), timetableEntryId]
  )
  const cohortCount = Number(studentCount?.total || 0)
  if (cohortCount > Number(newVenue.capacity || 0)) {
    return {
      valid: false,
      conflicts: [
        {
          type: 'VENUE_CAPACITY_CONFLICT',
          message: `${newVenue.name} has capacity for ${newVenue.capacity} students, but the class has ${cohortCount}.`
        }
      ]
    }
  }

  const blocks =
    venueBlocks ||
    (await query(
      `SELECT id,
       TIME_FORMAT(start_datetime, '%H:%i') AS start_time,
       TIME_FORMAT(end_datetime, '%H:%i') AS end_time
     FROM venue_blocks
     WHERE venue_id = ? AND status = 'ACTIVE'
       AND DATE(start_datetime) <= ? AND DATE(end_datetime) >= ?
       AND TIME(start_datetime) < ? AND TIME(end_datetime) > ?`,
      [newVenueId, effectiveDate, effectiveDate, newEndTime, newStartTime]
    ))
  const appliedOverrides = await query(
    `SELECT * FROM schedule_overrides
     WHERE effective_date = ?
       AND status IN ('APPROVED', 'CANCELLED_NO_RESTORE')`,
    [effectiveDate]
  )
  const matchingOverrides = appliedOverrides.filter(
    override =>
      override.status === 'APPROVED' &&
      Number(override.newVenueId ?? override.new_venue_id) ===
      Number(newVenueId)
  )
  const overrideConflict = matchingOverrides.some(
    override =>
      String(newStartTime) < String(override.newEndTime) &&
      String(newEndTime) > String(override.newStartTime)
  )
  if (overrideConflict) {
    return {
      valid: false,
      conflicts: [
        {
          type: 'VENUE_CONFLICT',
          message: 'The selected venue is already booked for that make-up time.'
        }
      ]
    }
  }
  const dayOfWeek = weekdayNameFromDateOnly(effectiveDate)
  const [timetableRows, examRows] = await Promise.all([
    query(
      `SELECT te.*, GROUP_CONCAT(DISTINCT tec.cohort_id) AS cohort_ids
       FROM timetable_entries te
       LEFT JOIN timetable_entry_cohorts tec ON tec.timetable_entry_id = te.id
      WHERE te.day_of_week IN (?, ?, ?, ?) AND te.status = 'SCHEDULED'
       GROUP BY te.id`,
      [
        dayOfWeek,
        dayOfWeek.slice(0, 3),
        dayOfWeek.toUpperCase(),
        dayOfWeek.slice(0, 3).toUpperCase()
      ]
    ),
    query(
      `SELECT e.id, e.start_time, e.end_time, 'EXAM' AS event_type,
         GROUP_CONCAT(DISTINCT eva.venue_id) AS venue_ids,
         GROUP_CONCAT(DISTINCT ec.cohort_id) AS cohort_ids
       FROM exams e
       LEFT JOIN exam_venue_allocations eva ON eva.exam_id = e.id
       LEFT JOIN exam_cohorts ec ON ec.exam_id = e.id
       WHERE e.exam_date = ? AND e.status = 'SCHEDULED'
       GROUP BY e.id`,
      [effectiveDate]
    )
  ])
  const otherEntries = removeReplacedTimetableEntries(
    timetableRows,
    appliedOverrides,
    effectiveDate
  ).filter(row => Number(row.id) !== Number(timetableEntryId))
  const currentEntry = timetableRows.find(
    row => Number(row.id) === Number(timetableEntryId)
  )
  const existingEvents = [
    ...otherEntries.map(row => ({
      ...row,
      venue_ids: String(row.venue_id),
      cohort_ids: row.cohort_ids || String(row.cohort_id || '')
    })),
    ...examRows.map(row => ({
      ...row,
      venue_ids: row.venue_ids || '',
      cohort_ids: row.cohort_ids || ''
    }))
  ]
  const validation = validateTimetableEntry({
    venueId: newVenueId,
    lecturerId: value('lecturerId', 'lecturer_id'),
    cohortId: value('cohortId', 'cohort_id'),
    cohortIds: currentEntry?.cohort_ids
      ? String(currentEntry.cohort_ids).split(',').map(Number)
      : [Number(value('cohortId', 'cohort_id'))],
    dayOfWeek,
    startTime: newStartTime,
    endTime: newEndTime,
    existingEvents,
    venueBlocks: blocks.map(block => ({
      ...block,
      start_time: block.start_time,
      end_time: block.end_time
    }))
  })

  if (!validation.valid) {
    return {
      valid: false,
      conflicts: validation.conflicts
    }
  }

  const record = await createRow('schedule_overrides', {
    timetable_entry_id: timetableEntryId,
    effective_date: effectiveDate,
    original_venue_id: value('venueId', 'venue_id'),
    new_venue_id: newVenueId,
    original_start_time: value('startTime', 'start_time'),
    new_start_time: newStartTime,
    original_end_time: value('endTime', 'end_time'),
    new_end_time: newEndTime,
    reason,
    status: 'APPROVED',
    created_by: createdBy,
    approved_by: createdBy
  })

  emitSocketEvent('timetable:override_created', record)
  emitSocketEvent('timetable:changed', {
    action: 'makeup-class-created',
    ids: [record.id]
  })

  const recipients = await query(
    `SELECT DISTINCT s.user_id
     FROM students s
     WHERE s.status = 'ACTIVE' AND s.user_id IS NOT NULL
       AND s.cohort_id IN (
         SELECT tec.cohort_id FROM timetable_entry_cohorts tec
         WHERE tec.timetable_entry_id = ?
         UNION
         SELECT te.cohort_id FROM timetable_entries te
         WHERE te.id = ? AND te.cohort_id IS NOT NULL
       )`,
    [timetableEntryId, timetableEntryId]
  )
  await Promise.all(
    recipients.map(({ user_id }) =>
      createNotification({
        userId: user_id,
        type: 'schedule:makeup_created',
        title: 'Make-up class scheduled',
        message: `${unit?.code ? `${unit.code} · ` : ''}${
          unit?.name || 'Class'
        } has been rescheduled to ${dayOfWeek}, ${effectiveDate}, ${newStartTime}–${newEndTime} at ${
          newVenue.code ? `${newVenue.code} · ` : ''
        }${newVenue.name}.`,
        entityType: 'schedule_override',
        entityId: record.id
      })
    )
  )

  return {
    valid: true,
    data: record
  }
}

const restorationConflictMessages = async (
  connection,
  override,
  venueId,
  startTime,
  endTime
) => {
  if (!venueId) return []
  const date = String(override.effective_date).slice(0, 10)
  const day = weekdayNameFromDateOnly(date)
  const dayVariants = [
    day,
    day?.slice(0, 3),
    day?.toUpperCase(),
    day?.slice(0, 3).toUpperCase()
  ]
  const [recurringRows] = await connection.execute(
    `SELECT te.id FROM timetable_entries te
     WHERE te.status = 'SCHEDULED' AND te.id <> ? AND te.venue_id = ?
       AND te.day_of_week IN (?, ?, ?, ?)
       AND te.start_time < ? AND te.end_time > ?
       AND NOT EXISTS (
         SELECT 1 FROM schedule_overrides so
         WHERE so.timetable_entry_id = te.id AND so.effective_date = ?
           AND so.status IN ('APPROVED', 'CANCELLED_NO_RESTORE')
       )
     LIMIT 1`,
    [
      Number(override.timetable_entry_id),
      Number(venueId),
      ...dayVariants,
      endTime,
      startTime,
      date
    ]
  )
  if (recurringRows.length) {
    return [
      'The original venue is booked by another timetable class at that time.'
    ]
  }

  const [makeupRows] = await connection.execute(
    `SELECT id FROM schedule_overrides
     WHERE id <> ? AND effective_date = ? AND status = 'APPROVED'
       AND new_venue_id = ? AND new_start_time < ? AND new_end_time > ?
     LIMIT 1`,
    [Number(override.id), date, Number(venueId), endTime, startTime]
  )
  if (makeupRows.length) {
    return [
      'The original venue is booked by another make-up class at that time.'
    ]
  }

  const [examRows] = await connection.execute(
    `SELECT e.id FROM exams e
     JOIN exam_venue_allocations eva ON eva.exam_id = e.id
     WHERE e.status = 'SCHEDULED' AND e.exam_date = ?
       AND eva.venue_id = ? AND e.start_time < ? AND e.end_time > ?
     LIMIT 1`,
    [date, Number(venueId), endTime, startTime]
  )
  if (examRows.length) {
    return ['The original venue is booked by an exam at that time.']
  }

  const [blockRows] = await connection.execute(
    `SELECT id FROM venue_blocks
     WHERE venue_id = ? AND status = 'ACTIVE'
       AND DATE(start_datetime) <= ? AND DATE(end_datetime) >= ?
       AND TIME(start_datetime) < ? AND TIME(end_datetime) > ?
     LIMIT 1`,
    [Number(venueId), date, date, endTime, startTime]
  )
  return blockRows.length
    ? ['The original venue is blocked during that time.']
    : []
}

export const cancelScheduleOverride = async ({
  overrideId,
  requesterUserId,
  requesterRoles = []
}) => {
  const id = Number(overrideId)
  if (!Number.isInteger(id) || id < 1) {
    throw new Error('Select a valid make-up class to cancel.')
  }
  const roles = Array.isArray(requesterRoles)
    ? requesterRoles
    : [requesterRoles]
  const connection = await db.getConnection()
  let result
  try {
    await connection.beginTransaction()
    const [rows] = await connection.execute(
      `SELECT so.*, DATE_FORMAT(so.effective_date, '%Y-%m-%d') AS effective_date,
         te.lecturer_id, te.venue_id AS recurring_venue_id,
         te.start_time AS recurring_start_time,
         te.end_time AS recurring_end_time
       FROM schedule_overrides so
       JOIN timetable_entries te ON te.id = so.timetable_entry_id
       WHERE so.id = ? FOR UPDATE`,
      [id]
    )
    const override = rows[0]
    if (!override) throw new Error('Make-up class not found.')
    if (override.status !== 'APPROVED') {
      throw new Error('This make-up class is no longer active.')
    }

    if (!roles.includes('ADMIN')) {
      const [lecturers] = await connection.execute(
        'SELECT id FROM lecturers WHERE id = ? AND user_id = ?',
        [Number(override.lecturer_id), Number(requesterUserId)]
      )
      if (!roles.includes('LECTURER') || !lecturers.length) {
        throw new Error('You may only cancel your own make-up classes.')
      }
    }

    const originalVenueId =
      override.original_venue_id ?? override.recurring_venue_id
    const originalStartTime =
      override.original_start_time ?? override.recurring_start_time
    const originalEndTime =
      override.original_end_time ?? override.recurring_end_time
    const conflicts = await restorationConflictMessages(
      connection,
      override,
      originalVenueId,
      originalStartTime,
      originalEndTime
    )
    const nextStatus = conflicts.length
      ? 'CANCELLED_NO_RESTORE'
      : 'CANCELLED'
    await connection.execute(
      'UPDATE schedule_overrides SET status = ? WHERE id = ?',
      [nextStatus, Number(override.id)]
    )
    const warning = conflicts.length
      ? `${conflicts.join(' ')} The make-up class was cancelled and its venue is free. Book another make-up class for this session.`
      : 'The make-up class was cancelled, its venue is free, and the original venue and time are restored.'
    await connection.execute(
      `INSERT INTO audit_logs
       (user_id, action, entity_type, entity_id, old_values, new_values, reason)
       VALUES (?, 'CANCEL_MAKEUP_CLASS', 'schedule_override', ?, ?, ?, ?)`,
      [
        Number(requesterUserId),
        Number(override.id),
        JSON.stringify({ status: 'APPROVED' }),
        JSON.stringify({
          status: nextStatus,
          originalRestored: conflicts.length === 0,
          conflicts
        }),
        warning
      ]
    )
    await connection.commit()
    result = {
      id: Number(override.id),
      status: nextStatus,
      originalRestored: conflicts.length === 0,
      conflicts,
      message: warning
    }
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }

  emitSocketEvent('timetable:override_cancelled', result)
  emitSocketEvent('timetable:changed', {
    action: 'makeup-class-cancelled',
    ids: [result.id]
  })
  return result
}
