import test from 'node:test'
import assert from 'node:assert/strict'
import { uniqueScheduleIds } from './uniqueScheduleIds.js'

test('unique schedule IDs remove duplicate numeric and string IDs', () => {
  assert.deepEqual(uniqueScheduleIds([1, '1', 2, '2']), [1, 2])
})

test('unique schedule IDs ignore empty values', () => {
  assert.deepEqual(uniqueScheduleIds([0, '', null, 3]), [3])
})
