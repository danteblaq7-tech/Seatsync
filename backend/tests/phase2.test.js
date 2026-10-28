import test from 'node:test'
import assert from 'node:assert/strict'

import { checkVenueBlockConflict } from '../src/services/scheduling/conflictService.js'
import { createVenueBlock } from '../src/services/venues/venueBlockService.js'
import { createNotification } from '../src/services/notifications/notificationService.js'

test('rejects a schedule override time that overlaps a venue block', () => {
  const result = checkVenueBlockConflict({
    startTime: '09:00',
    endTime: '11:00',
    venueBlocks: [
      {
        id: 5,
        day_of_week: 'SUNDAY',
        startTime: '09:30',
        endTime: '10:30'
      }
    ]
  })

  assert.equal(result.valid, false)
  assert.equal(result.conflicts[0].type, 'VENUE_BLOCK_CONFLICT')
})

test('records a venue block when the period is valid', () => {
  const result = createVenueBlock({
    venueId: 1,
    startDatetime: '2026-09-21T08:00:00',
    endDatetime: '2026-09-21T17:00:00',
    reason: 'Maintenance',
    status: 'ACTIVE'
  })

  assert.equal(result.valid, true)
  assert.equal(result.data.reason, 'Maintenance')
})

test('creates a persisted notification for a timetable change', () => {
  const notification = createNotification({
    userId: 7,
    type: 'timetable:updated',
    title: 'Timetable changed',
    message: 'COMP 321 has been moved to LH-03',
    entityType: 'timetable_entry',
    entityId: 12
  })

  assert.equal(notification.userId, 7)
  assert.equal(notification.isRead, false)
  assert.equal(notification.type, 'timetable:updated')
})
