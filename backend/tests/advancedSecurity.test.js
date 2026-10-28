import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createAuditLog,
  authorizeAction
} from '../src/services/security/securityService.js'

test('creates an audit log for a timetable change', () => {
  const log = createAuditLog({
    userId: 1,
    action: 'UPDATE_TIMETABLE',
    entityType: 'timetable_entry',
    entityId: 15,
    oldValues: { venueId: 1 },
    newValues: { venueId: 3 },
    reason: 'Room reallocation',
    ipAddress: '127.0.0.1',
    userAgent: 'test-agent'
  })

  assert.equal(log.valid, true)
  assert.equal(log.data.action, 'UPDATE_TIMETABLE')
})

test('allows admin to approve a protected action and blocks student from changing official timetable', () => {
  const adminAllowed = authorizeAction({
    userRoles: ['ADMIN'],
    action: 'CREATE_TIMETABLE'
  })
  const studentBlocked = authorizeAction({
    userRoles: ['STUDENT'],
    action: 'CREATE_TIMETABLE'
  })

  assert.equal(adminAllowed.allowed, true)
  assert.equal(studentBlocked.allowed, false)
  assert.equal(studentBlocked.reason, 'ROLE_NOT_ALLOWED')
})
