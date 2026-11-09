import test from 'node:test'
import assert from 'node:assert/strict'
import { canCompareVenueConflict } from './timetableConflicts.js'

test('exams and recurring timetable events are never compared for conflicts', () => {
  assert.equal(
    canCompareVenueConflict(
      { id: 'exam-1', event_type: 'EXAM', exam_date: '2026-11-02' },
      { id: 2, event_type: 'LECTURE', day_of_week: 'Monday' }
    ),
    false
  )
})

test('different exam groups on different dates are not compared', () => {
  assert.equal(
    canCompareVenueConflict(
      { id: 'exam-1', exam_date: '2026-11-02' },
      { id: 'exam-2', exam_date: '2026-11-09' }
    ),
    false
  )
})

test('unit groups in the same sitting are allowed to share venues', () => {
  assert.equal(
    canCompareVenueConflict(
      { id: 'exam-1', exam_date: '2026-11-02', sitting_group_id: 'sitting-1' },
      { id: 'exam-2', exam_date: '2026-11-02', sitting_group_id: 'sitting-1' }
    ),
    false
  )
})

test('other events of the same kind remain eligible for conflict checks', () => {
  assert.equal(
    canCompareVenueConflict(
      { id: 1, event_type: 'LECTURE' },
      { id: 2, event_type: 'LECTURE' }
    ),
    true
  )
  assert.equal(
    canCompareVenueConflict(
      { id: 'exam-1', exam_date: '2026-11-02' },
      { id: 'exam-2', exam_date: '2026-11-02' }
    ),
    true
  )
})
