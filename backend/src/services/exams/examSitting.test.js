import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getExamGroupStudentCount,
  getExamSittingGroupId,
  getExamUnitGroups,
  validateExamSittingCapacity
} from './examSitting.js'

test('exam unit groups retain independent cohort and venue allocations', () => {
  const groups = getExamUnitGroups({
    unit_groups: [
      {
        course_id: 3,
        cohort_allocations: [{ cohortId: 7, studentCount: 20 }],
        venue_allocations: [{ venueId: 4, allocatedCapacity: 50 }]
      },
      {
        course_id: 5,
        cohort_allocations: [{ cohortId: 8, studentCount: 15 }],
        venue_allocations: [{ venueId: 4, allocatedCapacity: 50 }]
      }
    ]
  })

  assert.equal(groups.length, 2)
  assert.equal(getExamGroupStudentCount(groups[0]), 20)
  assert.equal(getExamGroupStudentCount(groups[1]), 15)
})

test('legacy single-unit exam payloads remain supported', () => {
  const groups = getExamUnitGroups({
    course_id: 3,
    cohort_allocations: [{ cohort_id: 7, student_count: 20 }],
    venue_allocations: [{ venue_id: 4, allocated_capacity: 50 }]
  })

  assert.equal(groups.length, 1)
  assert.equal(groups[0].course_id, 3)
  assert.equal(getExamSittingGroupId({ sitting_group_id: 'sitting-1' }), 'sitting-1')
})

test('combined unit groups cannot exceed the shared venue allocation', async () => {
  const connection = {
    execute: async () => [[{ capacity: 50 }]]
  }
  const groups = [
    {
      venue_allocations: [
        {
          venue_id: 4,
          allocated_capacity: 50,
          student_count: 30
        }
      ]
    },
    {
      venue_allocations: [
        {
          venue_id: 4,
          allocated_capacity: 50,
          student_count: 21
        }
      ]
    }
  ]

  await assert.rejects(
    validateExamSittingCapacity(connection, groups),
    /combined unit groups exceed/
  )
})
