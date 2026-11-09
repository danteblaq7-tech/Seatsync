const removableOverrideStatuses = new Set([
  'CANCELLED',
  'CANCELLED_NO_RESTORE'
])

export const canRemoveOverrideHistory = overrides =>
  overrides.every(override =>
    removableOverrideStatuses.has(String(override.status || '').toUpperCase())
  )
