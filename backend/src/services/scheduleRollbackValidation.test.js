import test from 'node:test'
import assert from 'node:assert/strict'
import { canRemoveOverrideHistory } from './scheduleRollbackValidation.js'

test('allows rollback after all make-up overrides have been cancelled', () => {
  assert.equal(
    canRemoveOverrideHistory([
      { status: 'CANCELLED' },
      { status: 'CANCELLED_NO_RESTORE' }
    ]),
    true
  )
})

test('keeps rollback blocked while any make-up override is unresolved', () => {
  assert.equal(
    canRemoveOverrideHistory([
      { status: 'CANCELLED' },
      { status: 'APPROVED' }
    ]),
    false
  )
  assert.equal(canRemoveOverrideHistory([{ status: 'PENDING' }]), false)
})
