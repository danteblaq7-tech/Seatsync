import test from 'node:test'
import assert from 'node:assert/strict'
import { buildTimetableQueryFilters } from './timetableQueryFilters.js'

test('builds parameterized role-independent timetable filters', () => {
  const filters = buildTimetableQueryFilters({
    academicYear: '4',
    semester: '9',
    cohort: '12',
    programme: '3',
    lecturer: '7',
    venue: '5',
    eventType: 'LECTURE',
    day: 'Mon',
    startTime: '09:00',
    endTime: '11:00',
    search: 'Systems'
  })

  assert.equal(filters.conditions.length, 11)
  assert.deepEqual(filters.params, [
    '4',
    '9',
    '12',
    '12',
    '3',
    '7',
    '5',
    'LECTURE',
    'MON',
    '11:00',
    '09:00',
    '%Systems%',
    '%Systems%',
    '%Systems%',
    '%Systems%',
    '%Systems%',
    '%Systems%'
  ])
})

test('separates make-up event filtering from recurring events', () => {
  const makeup = buildTimetableQueryFilters(
    { eventType: 'MAKEUP', venue: '6' },
    { override: true }
  )
  const recurring = buildTimetableQueryFilters({ eventType: 'MAKEUP' })

  assert.deepEqual(makeup.params, ['6'])
  assert.match(makeup.conditions[0], /so\.new_venue_id/)
  assert.deepEqual(recurring.conditions, ['1 = 0'])
})

test('exam filters address exam allocations and date instead of recurring days', () => {
  const filters = buildTimetableQueryFilters(
    { cohort: '12', venue: '5', day: 'Wed', eventType: 'EXAM' },
    { kind: 'exam' }
  )

  assert.match(filters.conditions[0], /exam_cohorts/)
  assert.match(filters.conditions[1], /exam_venue_allocations/)
  assert.match(filters.conditions[2], /exam_date/)
  assert.deepEqual(filters.params, ['12', '5', 'WED'])
})
