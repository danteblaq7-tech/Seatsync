import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveProgrammeIds } from './programmeSelection.js'

test('preserves the programme selection saved on a timetable event', () => {
  assert.deepEqual(resolveProgrammeIds([2], [2, 4, 7]), ['2'])
})

test('an explicitly empty event selection does not add all unit programmes', () => {
  assert.deepEqual(resolveProgrammeIds([], [2, 4, 7]), [])
})

test('legacy events without saved programme IDs fall back to unit programmes', () => {
  assert.deepEqual(resolveProgrammeIds(null, ['2', '4']), ['2', '4'])
})

test('limits restored event programmes to the programmes of its cohorts', () => {
  assert.deepEqual(
    resolveProgrammeIds([1, 2], [1, 2, 3], [2]),
    ['2']
  )
})

test('restores programme IDs from cohorts when saved programme IDs are stale', () => {
  assert.deepEqual(resolveProgrammeIds([1], [], [2]), ['2'])
})
