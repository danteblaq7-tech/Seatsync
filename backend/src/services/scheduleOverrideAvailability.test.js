import test from 'node:test'
import assert from 'node:assert/strict'
import {
  removeReplacedTimetableEntries,
  weekdayNameFromDateOnly
} from './scheduleOverrideAvailability.js'

test('date-only weekday conversion does not shift Wednesday to Tuesday', () => {
  assert.equal(weekdayNameFromDateOnly('2026-11-04'), 'Wednesday')
  assert.equal(weekdayNameFromDateOnly('2026-11-03'), 'Tuesday')
})

test('a make-up override frees its recurring venue booking only on its date', () => {
  const entries = [
    { id: 12, venue_id: 4, start_time: '10:00', end_time: '11:00' },
    { id: 13, venue_id: 4, start_time: '11:00', end_time: '12:00' }
  ]
  const overrides = [
    {
      timetable_entry_id: 12,
      effective_date: '2026-11-05',
      new_venue_id: 8,
      new_start_time: '12:00',
      new_end_time: '13:00'
    }
  ]

  assert.deepEqual(
    removeReplacedTimetableEntries(entries, overrides, '2026-11-05'),
    [entries[1]]
  )
  assert.deepEqual(
    removeReplacedTimetableEntries(entries, overrides, '2026-11-12'),
    entries
  )
})

test('a cancelled make-up suppresses the original only when its venue cannot be restored', () => {
  const entries = [{ id: 12 }, { id: 13 }, { id: 14 }]
  const overrides = [
    {
      timetable_entry_id: 12,
      effective_date: '2026-11-05',
      status: 'CANCELLED'
    },
    {
      timetable_entry_id: 13,
      effective_date: '2026-11-05',
      status: 'CANCELLED_NO_RESTORE'
    },
    {
      timetable_entry_id: 14,
      effective_date: '2026-11-05',
      status: 'APPROVED'
    }
  ]

  assert.deepEqual(
    removeReplacedTimetableEntries(entries, overrides, '2026-11-05'),
    [entries[0]]
  )
})
