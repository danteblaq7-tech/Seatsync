export const isValidTimeRange = (startTime, endTime) => {
  if (!startTime || !endTime) return false
  const toMinutes = value => {
    const [hours, minutes] = String(value).split(':').map(Number)
    return hours * 60 + minutes
  }

  return toMinutes(endTime) > toMinutes(startTime)
}

export const normalizeConflictResult = (conflicts = []) => ({
  valid: conflicts.length === 0,
  conflicts
})
