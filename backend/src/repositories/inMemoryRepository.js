export const listRecords = (collection, filters = {}) => {
  let items = [...collection]

  Object.entries(filters).forEach(([key, value]) => {
    items = items.filter(item => item[key] === value)
  })

  return items
}

export const getById = (collection, id) =>
  collection.find(item => item.id === Number(id))

export const createRecord = (collection, payload) => {
  const nextId = collection.length
    ? Math.max(...collection.map(item => Number(item.id || 0))) + 1
    : 1
  const record = {
    id: nextId,
    ...payload,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
  collection.push(record)
  return record
}

export const updateRecord = (collection, id, updates) => {
  const record = getById(collection, id)
  if (!record) return null

  Object.assign(record, updates, { updated_at: new Date().toISOString() })
  return record
}

export const removeRecord = (collection, id) => {
  const index = collection.findIndex(item => item.id === Number(id))
  if (index === -1) return false
  collection.splice(index, 1)
  return true
}
