import test from 'node:test'
import assert from 'node:assert/strict'
import { assertNoStagedDraftConflict } from './scheduleDraftConflict.js'

const multiUnitDraft = (id, courseId, cohortId) => ({
  id,
  kind: 'exam',
  payload: {
    sitting_group_id: 'same-sitting',
    exam_date: '2026-12-01',
    start_time: '09:00',
    end_time: '12:00',
    unit_groups: [
      {
        course_id: courseId,
        cohort_allocations: [{ cohortId, studentCount: 20 }],
        venue_allocations: [{ venueId: 5, studentCount: 20 }]
      }
    ]
  }
})

test('unit groups in the same sitting can share a venue', () => {
  assert.doesNotThrow(() =>
    assertNoStagedDraftConflict(
      multiUnitDraft('one', 3, 10),
      [multiUnitDraft('two', 4, 11)]
    )
  )
})

test('unit groups in the same sitting cannot share a cohort', () => {
  assert.throws(
    () =>
      assertNoStagedDraftConflict(
        multiUnitDraft('one', 3, 10),
        [multiUnitDraft('two', 4, 10)]
      ),
    /cohort .* has overlapping exams/
  )
})

test('unrelated exam sittings cannot share a venue at overlapping times', () => {
  const first = multiUnitDraft('one', 3, 10)
  const second = multiUnitDraft('two', 4, 11)
  second.payload.sitting_group_id = 'different-sitting'
  assert.throws(
    () => assertNoStagedDraftConflict(first, [second]),
    /venue .* is allocated to overlapping exams/
  )
})
