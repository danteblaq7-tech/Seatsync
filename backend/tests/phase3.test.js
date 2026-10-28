import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createExam,
  createExamCohortAllocation,
  allocateExamVenue
} from '../src/services/exams/examService.js'

test('creates a valid exam and cohort allocation', () => {
  const exam = createExam({
    academicYearId: 1,
    semesterId: 1,
    courseId: 1,
    examType: 'FINAL',
    examDate: '2026-12-14',
    startTime: '09:00',
    endTime: '11:00',
    durationMinutes: 120,
    status: 'SCHEDULED',
    instructions: 'Bring registration card'
  })

  const allocation = createExamCohortAllocation({
    examId: exam.data.id,
    cohortId: 1,
    studentCount: 70
  })

  assert.equal(exam.valid, true)
  assert.equal(allocation.valid, true)
  assert.equal(allocation.data.studentCount, 70)
})

test('rejects exam venue allocation when the venue is already in use for a conflicting exam', () => {
  const examA = createExam({
    academicYearId: 1,
    semesterId: 1,
    courseId: 1,
    examType: 'FINAL',
    examDate: '2026-12-14',
    startTime: '09:00',
    endTime: '11:00',
    durationMinutes: 120,
    status: 'SCHEDULED'
  })

  const examB = createExam({
    academicYearId: 1,
    semesterId: 1,
    courseId: 1,
    examType: 'CAT',
    examDate: '2026-12-14',
    startTime: '10:00',
    endTime: '12:00',
    durationMinutes: 120,
    status: 'SCHEDULED'
  })

  const allocationA = allocateExamVenue({
    examId: examA.data.id,
    venueId: 1,
    allocatedCapacity: 120,
    studentCount: 70,
    examAllocations: [
      {
        examId: examA.data.id,
        venueId: 1,
        allocatedCapacity: 120,
        studentCount: 70,
        examDate: '2026-12-14',
        startTime: '09:00',
        endTime: '11:00'
      }
    ]
  })

  const allocationB = allocateExamVenue({
    examId: examB.data.id,
    venueId: 1,
    allocatedCapacity: 120,
    studentCount: 70,
    examAllocations: [
      {
        examId: examB.data.id,
        venueId: 1,
        allocatedCapacity: 120,
        studentCount: 70,
        examDate: '2026-12-14',
        startTime: '10:00',
        endTime: '12:00'
      }
    ]
  })

  assert.equal(allocationA.valid, true)
  assert.equal(allocationB.valid, false)
  assert.equal(allocationB.conflicts[0].type, 'EXAM_VENUE_CONFLICT')
})
