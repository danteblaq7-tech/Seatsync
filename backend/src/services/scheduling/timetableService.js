import { validateTimetableEntry } from './conflictService.js'

export const createTimetableEntry = ({
  venueId,
  lecturerId,
  cohortId,
  dayOfWeek,
  expectedStudents,
  venueCapacity,
  startTime,
  endTime,
  existingEvents = [],
  venueBlocks = []
}) => {
  const result = validateTimetableEntry({
    venueId,
    lecturerId,
    cohortId,
    dayOfWeek,
    expectedStudents,
    venueCapacity,
    startTime,
    endTime,
    existingEvents,
    venueBlocks
  })

  return {
    valid: result.valid,
    data: result.valid
      ? { venueId, lecturerId, cohortId, startTime, endTime }
      : null,
    conflicts: result.conflicts
  }
}
