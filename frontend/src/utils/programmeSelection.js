export const resolveProgrammeIds = (
  assignedIds,
  fallbackIds = [],
  allowedIds
) => {
  const source =
    assignedIds === undefined || assignedIds === null
      ? fallbackIds
      : assignedIds
  const resolved = Array.isArray(source)
    ? source.map(String)
    : String(source || '')
        .split(',')
        .map(value => value.trim())
        .filter(Boolean)
  if (!Array.isArray(allowedIds)) return resolved
  const allowed = new Set(allowedIds.map(String))
  const matching = [...new Set(resolved.filter(id => allowed.has(id)))]
  return matching.length ? matching : [...allowed]
}
