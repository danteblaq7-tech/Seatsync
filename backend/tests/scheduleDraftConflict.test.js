import test from 'node:test'
import assert from 'node:assert/strict'
import { assertNoStagedDraftConflict } from '../src/services/scheduleDraftConflict.js'

const examDraft = (id, overrides = {}) => ({
  id,
  kind: 'exam',
  payload: {
    course_id: 12,
    exam_date: '2026-11-05',
    start_time: '09:00',
    end_time: '12:00',
    cohort_allocations: [{ cohortId: 3, studentCount: 30 }],
    venue_allocations: [{ venueId: 4, studentCount: 30 }],
    ...overrides
  }
})

const eventDraft = (id, overrides = {}) => ({
  id,
  kind: 'timetable',
  payload: {
    day_of_week: 'Thu',
    start_time: '10:00',
    end_time: '11:00',
    venue_id: 4,
    lecturer_id: 7,
    cohort_ids: [3],
    ...overrides
  }
})

test('rejects staged exams that share a venue and partially overlap', () => {
  const first = examDraft('first')
  const second = examDraft('second', {
    course_id: 22,
    start_time: '11:00',
    end_time: '13:00',
    cohort_allocations: [{ cohortId: 9, studentCount: 20 }]
  })

  assert.throws(
    () => assertNoStagedDraftConflict(second, [first]),
    /venue 4.*overlapping exams/i
  )
})

test('uses staged venue and cohort names in conflict details when provided', () => {
  const first = examDraft('first', {
    venue_names: [{ id: 4, name: 'North Hall' }],
    cohort_names: [{ id: 3, name: 'BSc Computing Year 2' }]
  })
  const second = examDraft('second', {
    course_id: 22,
    start_time: '11:00',
    end_time: '13:00',
    cohort_allocations: [{ cohortId: 9, studentCount: 20 }],
    venue_names: [{ id: 4, name: 'North Hall' }]
  })

  assert.throws(
    () => assertNoStagedDraftConflict(second, [first]),
    /North Hall.*overlapping exams/i
  )
})

test('does not cross-check exam drafts and timetable event drafts', () => {
  const event = eventDraft('event')
  const exam = examDraft('exam', {
    start_time: '10:30',
    end_time: '12:30',
    venue_allocations: [{ venueId: 8, studentCount: 30 }]
  })

  assert.doesNotThrow(() => assertNoStagedDraftConflict(exam, [event]))
  assert.doesNotThrow(() => assertNoStagedDraftConflict(event, [exam]))
})

test('rejects staged timetable events that share a lecturer and overlap', () => {
  const first = eventDraft('first', { venue_id: 4, cohort_ids: [3] })
  const second = eventDraft('second', {
    start_time: '10:30',
    end_time: '11:30',
    venue_id: 9,
    cohort_ids: [8]
  })

  assert.throws(
    () => assertNoStagedDraftConflict(second, [first]),
    /lecturer 7.*overlapping/i
  )
})

test('allows back-to-back staged exams and excludes the edited draft itself', () => {
  const existing = examDraft('same', { end_time: '12:00' })
  const backToBack = examDraft('next', {
    course_id: 18,
    start_time: '12:00',
    end_time: '13:00'
  })

  assert.doesNotThrow(() => assertNoStagedDraftConflict(backToBack, [existing]))
  assert.doesNotThrow(() => assertNoStagedDraftConflict(existing, [existing]))
})
