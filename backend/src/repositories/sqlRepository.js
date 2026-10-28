import db from '../config/db.js'

const toSnakeCase = value =>
  String(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/-/g, '_')
    .toLowerCase()

const toCamelCase = value =>
  String(value).replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())

const normalizePayload = (payload = {}) => {
  const normalized = {}
  Object.entries(payload).forEach(([key, value]) => {
    if (value === undefined) return
    normalized[toSnakeCase(key)] = value
  })
  return normalized
}

export const normalizeDateValue = value => {
  if (!(value instanceof Date)) return value
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(
    2,
    '0'
  )}-${String(value.getUTCDate()).padStart(2, '0')}`
}

export const normalizeRow = row => {
  if (!row || typeof row !== 'object') return row

  const normalized = {}
  Object.entries(row).forEach(([key, value]) => {
    normalized[toCamelCase(key)] =
      key === 'exam_date' ? normalizeDateValue(value) : value
  })

  return normalized
}

export const query = async (sql, params = []) => {
  const [rows] = await db.execute(sql, params)
  return rows
}

export const listRows = async (table, filters = {}, orderBy = 'id') => {
  const entries = Object.entries(filters).filter(
    ([, value]) => value !== undefined && value !== null
  )
  const clauses = entries.map(([key]) => `\`${toSnakeCase(key)}\` = ?`)
  const params = entries.map(([, value]) => value)
  const sql = clauses.length
    ? `SELECT * FROM \`${table}\` WHERE ${clauses.join(
        ' AND '
      )} ORDER BY ${orderBy}`
    : `SELECT * FROM \`${table}\` ORDER BY ${orderBy}`

  const rows = await query(sql, params)
  return rows.map(normalizeRow)
}

export const findById = async (table, id) => {
  const rows = await query(`SELECT * FROM \`${table}\` WHERE id = ?`, [id])
  return rows[0] ? normalizeRow(rows[0]) : null
}

export const createRow = async (table, payload) => {
  const normalized = normalizePayload(payload)
  const keys = Object.keys(normalized)

  if (!keys.length) {
    return null
  }

  const columns = keys.map(key => `\`${key}\``).join(', ')
  const placeholders = keys.map(() => '?').join(', ')
  const values = Object.values(normalized)
  const result = await query(
    `INSERT INTO \`${table}\` (${columns}) VALUES (${placeholders})`,
    values
  )

  if (result && result.insertId) {
    return findById(table, result.insertId)
  }

  const whereClauses = keys.map(key => `\`${key}\` = ?`).join(' AND ')

  const rows = await query(
    `SELECT * FROM \`${table}\` WHERE ${whereClauses}`,
    values
  )

  return rows[0] ? normalizeRow(rows[0]) : null
}

export const updateRow = async (table, id, payload) => {
  const normalized = normalizePayload(payload)
  const assignments = Object.keys(normalized).map(key => `\`${key}\` = ?`)
  const values = [...Object.values(normalized), id]

  if (!assignments.length) {
    return findById(table, id)
  }

  await query(
    `UPDATE \`${table}\` SET ${assignments.join(', ')} WHERE id = ?`,
    values
  )
  return findById(table, id)
}

export const deleteRow = async (table, id) => {
  const result = await query(`DELETE FROM \`${table}\` WHERE id = ?`, [id])
  return result.affectedRows > 0
}

export const rawQuery = async (sql, params = []) => query(sql, params)
