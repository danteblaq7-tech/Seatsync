import test from 'node:test'
import assert from 'node:assert/strict'

import {
  checkVenueConflict,
  checkLecturerConflict,
  checkCohortConflict
} from '../src/services/scheduling/conflictService.js'

test('detects overlapping venue conflicts', () => {
  const result = checkVenueConflict({
    venueId: 1,
    startTime: '09:00',
    endTime: '11:00',
    existingEvents: [
      { id: 10, venueId: 1, startTime: '08:00', endTime: '10:00' },
      { id: 11, venueId: 2, startTime: '09:30', endTime: '10:30' }
    ]
  })

  assert.equal(result.valid, false)
  assert.equal(result.conflicts[0].type, 'VENUE_CONFLICT')
})

test('detects overlapping lecturer conflicts', () => {
  const result = checkLecturerConflict({
    lecturerId: 3,
    startTime: '09:00',
    endTime: '11:00',
    existingEvents: [
      { id: 20, lecturerId: 3, startTime: '08:00', endTime: '10:00' }
    ]
  })

  assert.equal(result.valid, false)
  assert.equal(result.conflicts[0].type, 'LECTURER_CONFLICT')
})

test('only detects lecturer conflicts on the same day', () => {
  const result = checkLecturerConflict({
    lecturerId: 3,
    dayOfWeek: 'THURSDAY',
    startTime: '08:00',
    endTime: '12:00',
    existingEvents: [
      {
        id: 21,
        lecturer_id: 3,
        day_of_week: 'TUESDAY',
        start_time: '09:00',
        end_time: '11:00'
      },
      {
        id: 22,
        lecturer_id: 3,
        day_of_week: 'THURSDAY',
        start_time: '09:00',
        end_time: '11:00'
      }
    ]
  })

  assert.equal(result.valid, false)
  assert.equal(result.conflicts.length, 1)
  assert.equal(result.conflicts[0].conflictingEventId, 22)
})

test('detects overlapping cohort conflicts', () => {
  const result = checkCohortConflict({
    cohortId: 5,
    startTime: '09:00',
    endTime: '11:00',
    existingEvents: [
      { id: 30, cohortId: 5, startTime: '08:00', endTime: '10:00' }
    ]
  })

  assert.equal(result.valid, false)
  assert.equal(result.conflicts[0].type, 'COHORT_CONFLICT')
})

test('detects conflicts against any cohort in a merged existing entry', () => {
  const result = checkCohortConflict({
    cohortIds: [11],
    dayOfWeek: 'MON',
    startTime: '08:00',
    endTime: '10:00',
    existingEvents: [
      {
        id: 31,
        cohort_id: 9,
        cohort_ids: '9,11',
        day_of_week: 'MONDAY',
        start_time: '07:00',
        end_time: '09:00',
        event_type: 'LECTURE'
      }
    ]
  })

  assert.equal(result.valid, false)
  assert.equal(result.conflicts[0].conflictingEventId, 31)
})

test('does not treat an exam as a recurring cohort timetable event', () => {
  const result = checkCohortConflict({
    cohortIds: [11],
    dayOfWeek: 'MONDAY',
    startTime: '08:00',
    endTime: '10:00',
    existingEvents: [
      {
        id: 32,
        cohort_ids: '11',
        day_of_week: 'MONDAY',
        start_time: '07:00',
        end_time: '09:00',
        event_type: 'EXAM'
      }
    ]
  })

  assert.equal(result.valid, true)
})
