export const toArray = value => {
  if (Array.isArray(value)) return value
  if (Array.isArray(value?.data)) return value.data
  return []
}

export const toObject = value =>
  value && typeof value === 'object' && !Array.isArray(value) ? value : {}

export const list = value => (Array.isArray(value) ? value : [])
export const asStrings = value => list(value).map(String)

export const humanize = value => String(value || '').replaceAll('_', ' ')

export const fullName = (record, fallback = '') =>
  record?.name ||
  `${record?.firstName || record?.first_name || ''} ${record?.lastName || record?.last_name || ''}`.trim() ||
  fallback

export const qs = params => {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => search.append(key, value == null ? '' : String(value)))
  return search.toString()
}
