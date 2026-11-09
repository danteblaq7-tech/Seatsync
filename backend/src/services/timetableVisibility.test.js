import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getExamVisibility,
  getTimetableVisibility
} from './timetableVisibility.js'

test('admins can see all timetable events', () => {
  assert.deepEqual(getTimetableVisibility({ id: 1, roles: ['ADMIN'] }), {
    clause: '',
    params: []
  })
})

test('students see only events assigned to their active cohort', () => {
  const scope = getTimetableVisibility({ id: 12, roles: ['STUDENT'] })

  assert.match(scope.clause, /evs\.user_id = \?/)
  assert.match(scope.clause, /evs\.status = 'ACTIVE'/)
  assert.match(scope.clause, /timetable_entry_cohorts/)
  assert.deepEqual(scope.params, [12])
})

test('class representatives see events assigned to their representative cohort', () => {
  const scope = getTimetableVisibility({ id: 13, roles: ['CLASS_REP'] })

  assert.match(scope.clause, /cohort_representatives/)
  assert.match(scope.clause, /evrs\.user_id = \?/)
  assert.match(scope.clause, /evcr\.is_active = TRUE/)
  assert.deepEqual(scope.params, [13])
})

test('lecturers see only events they are assigned to teach', () => {
  const scope = getTimetableVisibility({ id: 14, roles: ['LECTURER'] })

  assert.match(scope.clause, /te\.lecturer_id IN/)
  assert.match(scope.clause, /employment_status = 'ACTIVE'/)
  assert.deepEqual(scope.params, [14])
})

test('unsupported roles do not receive timetable events', () => {
  assert.deepEqual(getTimetableVisibility({ id: 15, roles: ['GUEST'] }), {
    clause: 'WHERE 1 = 0',
    params: []
  })
})

test('students see only exams for their active cohort', () => {
  const studentScope = getExamVisibility({ id: 21, roles: ['STUDENT'] })

  assert.match(studentScope.clause, /exam_cohorts/)
  assert.match(studentScope.clause, /evc\.exam_id = e\.id/)
  assert.match(studentScope.clause, /evs\.status = 'ACTIVE'/)
  assert.deepEqual(studentScope.params, [21])
})

test('student class reps see only their cohort exams on the timetable', () => {
  const timetableScope = getExamVisibility(
    { id: 21, roles: ['STUDENT', 'CLASS_REP'] },
    { timetable: true }
  )

  assert.match(timetableScope.clause, /evc\.exam_id = e\.id/)
  assert.match(timetableScope.clause, /evs\.user_id = \?/)
  assert.match(timetableScope.clause, /cohort_representatives/)
  assert.deepEqual(timetableScope.params, [21, 21])
})

test('multi-role timetable exam visibility combines each assigned group scope', () => {
  const timetableScope = getExamVisibility(
    { id: 21, roles: ['STUDENT', 'LECTURER'] },
    { timetable: true }
  )

  assert.match(timetableScope.clause, /evs\.user_id = \?/)
  assert.match(timetableScope.clause, /evl\.user_id = \?/)
  assert.deepEqual(timetableScope.params, [21, 21, 21])
})

test('class representatives can view all exams without admin actions', () => {
  assert.deepEqual(getExamVisibility({ id: 22, roles: ['CLASS_REP'] }), {
    clause: '',
    params: []
  })
})

test('admins can see all exams', () => {
  assert.deepEqual(getExamVisibility({ id: 1, roles: ['ADMIN'] }), {
    clause: '',
    params: []
  })
})

test('lecturers see only exams for their assigned units', () => {
  const scope = getExamVisibility({ id: 23, roles: ['LECTURER'] })

  assert.match(scope.clause, /lecturer_units/)
  assert.match(scope.clause, /evlu\.unit_id = e\.unit_id/)
  assert.match(scope.clause, /lecturer_cohort_types/)
  assert.deepEqual(scope.params, [23, 23])
})
