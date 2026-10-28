const overlaps = (startA, endA, startB, endB) => {
  if (!startA || !endA || !startB || !endB) return false
  return startA < endB && endA > startB
}

const toMinutes = time => {
  if (!time) return 0
  const [hours, minutes] = String(time).split(':').map(Number)
  return hours * 60 + minutes
}

const field = (record, camelCase, snakeCase) =>
  record?.[camelCase] ?? record?.[snakeCase]

const ids = (record, camelCase, snakeCase, fallbackCamel, fallbackSnake) => {
  const value = field(record, camelCase, snakeCase)
  const selected =
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
      ? field(record, fallbackCamel, fallbackSnake)
      : value
  if (Array.isArray(selected)) return selected.map(Number)
  if (selected === undefined || selected === null || selected === '') return []
  return String(selected).split(',').map(Number).filter(Number.isFinite)
}

const sameId = (left, right) =>
  left !== undefined &&
  left !== null &&
  right !== undefined &&
  right !== null &&
  Number(left) === Number(right)

const hasResource = (
  event,
  singularCamel,
  singularSnake,
  pluralCamel,
  pluralSnake,
  id
) =>
  ids(event, pluralCamel, pluralSnake, singularCamel, singularSnake).some(
    eventId => sameId(eventId, id)
  )

const normalizedDay = value => {
  const day = String(value || '')
    .trim()
    .toUpperCase()
  const dayNames = {
    MON: 'MONDAY',
    MONDAY: 'MONDAY',
    TUE: 'TUESDAY',
    TUES: 'TUESDAY',
    TUESDAY: 'TUESDAY',
    WED: 'WEDNESDAY',
    WEDNESDAY: 'WEDNESDAY',
    THU: 'THURSDAY',
    THUR: 'THURSDAY',
    THURS: 'THURSDAY',
    THURSDAY: 'THURSDAY',
    FRI: 'FRIDAY',
    FRIDAY: 'FRIDAY',
    SAT: 'SATURDAY',
    SATURDAY: 'SATURDAY',
    SUN: 'SUNDAY',
    SUNDAY: 'SUNDAY'
  }
  return dayNames[day] || day
}

const isSameDay = (dayOfWeek, event) => {
  const eventDay = field(event, 'dayOfWeek', 'day_of_week')
  return (
    !dayOfWeek ||
    !eventDay ||
    normalizedDay(dayOfWeek) === normalizedDay(eventDay)
  )
}

export const checkVenueConflict = ({
  venueId,
  venueName,
  dayOfWeek,
  startTime,
  endTime,
  existingEvents = []
}) => {
  const conflicts = []
  for (const event of existingEvents) {
    if (
      !hasResource(
        event,
        'venueId',
        'venue_id',
        'venueIds',
        'venue_ids',
        venueId
      )
    )
      continue
    if (!isSameDay(dayOfWeek, event)) continue
    const overlapsEvent = overlaps(
      toMinutes(startTime),
      toMinutes(endTime),
      toMinutes(field(event, 'startTime', 'start_time')),
      toMinutes(field(event, 'endTime', 'end_time'))
    )
    if (overlapsEvent) {
      conflicts.push({
        type: 'VENUE_CONFLICT',
        message: `${venueName || `Venue ${venueId}`} is occupied from ${field(
          event,
          'startTime',
          'start_time'
        )} to ${field(event, 'endTime', 'end_time')}.`,
        conflictingEventId: event.id
      })
    }
  }

  return { valid: conflicts.length === 0, conflicts }
}

export const checkLecturerConflict = ({
  lecturerId,
  lecturerName,
  dayOfWeek,
  startTime,
  endTime,
  existingEvents = []
}) => {
  const conflicts = []
  for (const event of existingEvents) {
    if (!sameId(field(event, 'lecturerId', 'lecturer_id'), lecturerId)) continue
    if (!isSameDay(dayOfWeek, event)) continue
    const overlapsEvent = overlaps(
      toMinutes(startTime),
      toMinutes(endTime),
      toMinutes(field(event, 'startTime', 'start_time')),
      toMinutes(field(event, 'endTime', 'end_time'))
    )
    if (overlapsEvent) {
      conflicts.push({
        type: 'LECTURER_CONFLICT',
        message: `${
          lecturerName || `Lecturer ${lecturerId}`
        } is already assigned during ${field(
          event,
          'startTime',
          'start_time'
        )}-${field(event, 'endTime', 'end_time')}.`,
        conflictingEventId: event.id
      })
    }
  }

  return { valid: conflicts.length === 0, conflicts }
}

export const checkCohortConflict = ({
  cohortId,
  cohortIds = cohortId === undefined ? [] : [cohortId],
  cohortName,
  dayOfWeek,
  startTime,
  endTime,
  existingEvents = []
}) => {
  const conflicts = []
  for (const event of existingEvents) {
    if (
      String(field(event, 'eventType', 'event_type') || '').toUpperCase() ===
      'EXAM'
    )
      continue
    const sharesCohort = cohortIds.some(id =>
      hasResource(event, 'cohortId', 'cohort_id', 'cohortIds', 'cohort_ids', id)
    )
    if (!sharesCohort) continue
    if (!isSameDay(dayOfWeek, event)) continue
    const overlapsEvent = overlaps(
      toMinutes(startTime),
      toMinutes(endTime),
      toMinutes(field(event, 'startTime', 'start_time')),
      toMinutes(field(event, 'endTime', 'end_time'))
    )
    if (overlapsEvent) {
      conflicts.push({
        type: 'COHORT_CONFLICT',
        message: `${
          cohortName || `Cohort ${cohortId}`
        } is already scheduled from ${field(
          event,
          'startTime',
          'start_time'
        )} to ${field(event, 'endTime', 'end_time')}.`,
        conflictingEventId: event.id
      })
    }
  }

  return { valid: conflicts.length === 0, conflicts }
}

export const checkVenueCapacity = ({ expectedStudents, venueCapacity }) => {
  if (expectedStudents === undefined || venueCapacity === undefined) {
    return { valid: true, conflicts: [] }
  }

  if (expectedStudents > venueCapacity) {
    return {
      valid: false,
      conflicts: [
        {
          type: 'VENUE_CAPACITY_CONFLICT',
          message: `Expected ${expectedStudents} students exceeds venue capacity of ${venueCapacity}.`
        }
      ]
    }
  }

  return { valid: true, conflicts: [] }
}

export const checkVenueBlockConflict = ({
  dayOfWeek,
  startTime,
  endTime,
  venueBlocks = []
}) => {
  const conflicts = []
  for (const block of venueBlocks) {
    if (!isSameDay(dayOfWeek, block)) continue
    const overlapsBlock = overlaps(
      toMinutes(startTime),
      toMinutes(endTime),
      toMinutes(field(block, 'startTime', 'start_time')),
      toMinutes(field(block, 'endTime', 'end_time'))
    )
    if (overlapsBlock) {
      conflicts.push({
        type: 'VENUE_BLOCK_CONFLICT',
        message: `Venue is blocked from ${field(
          block,
          'startTime',
          'start_time'
        )} to ${field(block, 'endTime', 'end_time')}.`,
        conflictingEventId: block.id
      })
    }
  }

  return { valid: conflicts.length === 0, conflicts }
}

export const validateTimetableEntry = ({
  venueId,
  lecturerId,
  cohortId,
  cohortIds = cohortId === undefined ? [] : [cohortId],
  dayOfWeek,
  expectedStudents,
  venueCapacity,
  startTime,
  endTime,
  existingEvents = [],
  venueBlocks = []
}) => {
  const results = [
    checkVenueConflict({
      venueId,
      dayOfWeek,
      startTime,
      endTime,
      existingEvents
    }),
    checkLecturerConflict({
      lecturerId,
      dayOfWeek,
      startTime,
      endTime,
      existingEvents
    }),
    checkCohortConflict({
      cohortId,
      cohortIds,
      dayOfWeek,
      startTime,
      endTime,
      existingEvents
    }),
    checkVenueCapacity({ expectedStudents, venueCapacity }),
    checkVenueBlockConflict({ dayOfWeek, startTime, endTime, venueBlocks })
  ]

  const conflicts = results.flatMap(result => result.conflicts)
  return { valid: conflicts.length === 0, conflicts }
}
