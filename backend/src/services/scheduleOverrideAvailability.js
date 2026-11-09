export const weekdayNameFromDateOnly = value => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(
    String(value || '').slice(0, 10)
  )
  if (!match) return null
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  )
  if (
    date.getUTCFullYear() !== Number(match[1]) ||
    date.getUTCMonth() !== Number(match[2]) - 1 ||
    date.getUTCDate() !== Number(match[3])
  ) {
    return null
  }
  return [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday'
  ][date.getUTCDay()]
}

export const removeReplacedTimetableEntries = (
  entries,
  overrides,
  effectiveDate
) => {
  const overriddenEntryIds = new Set(
    overrides
      .filter(override => {
        const status = String(override.status || '').toUpperCase()
        return (
          (!status ||
            status === 'APPROVED' ||
            status === 'CANCELLED_NO_RESTORE') &&
          String(override.effectiveDate ?? override.effective_date).slice(
            0,
            10
          ) === String(effectiveDate).slice(0, 10)
        )
      })
      .map(override =>
        Number(override.timetableEntryId ?? override.timetable_entry_id)
      )
  )

  return entries.filter(entry => !overriddenEntryIds.has(Number(entry.id)))
}
