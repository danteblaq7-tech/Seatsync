const toDateOnly = value => {
  const normalized = String(value || '').slice(0, 10)
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized)
  if (!match) return null

  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  )
  return Number.isNaN(date.getTime()) ? null : date
}

export const formatDateOnly = (value, options = {}) => {
  const date = toDateOnly(value)
  return date
    ? date.toLocaleDateString(undefined, { ...options, timeZone: 'UTC' })
    : 'Invalid date'
}

export const weekdayFromDateOnly = (value, options = {}) => {
  const date = toDateOnly(value)
  return date
    ? date.toLocaleDateString('en-US', {
        weekday: 'short',
        ...options,
        timeZone: 'UTC'
      })
    : 'TBA'
}
