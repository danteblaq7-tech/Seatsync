import { validateTimetableEntry } from './conflictService.js'
import { emitSocketEvent } from '../../socket/socketEvents.js'
import {
  createRow,
  findById,
  query,
  listRows
} from '../../repositories/sqlRepository.js'

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

  const timetableEntry = await findById('timetable_entries', timetableEntryId)
  if (!timetableEntry) {
    return {
      valid: false,
      conflicts: [{ type: 'VALIDATION_ERROR', message: 'Class not found.' }]
    }
  }

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
  const matchingOverrides = await listRows('schedule_overrides', {
    effective_date: effectiveDate,
    new_venue_id: newVenueId,
    status: 'APPROVED'
  })
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
  const dayOfWeek = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday'
  ][new Date(`${effectiveDate}T00:00:00Z`).getUTCDay()]
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
  const otherEntries = timetableRows.filter(
    row => Number(row.id) !== Number(timetableEntryId)
  )
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

  return {
    valid: true,
    data: record
  }
}
