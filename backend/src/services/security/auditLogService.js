import { query } from '../../repositories/sqlRepository.js'

const sortableColumns = {
  date: 'a.created_at',
  action: 'a.action',
  entity: 'a.entity_type',
  user: 'u.last_name'
}

export const listAuditLogs = async ({
  search = '',
  action = '',
  entityType = '',
  dateFrom = '',
  dateTo = '',
  sort = 'date',
  direction = 'desc',
  page = 1,
  limit = 20
} = {}) => {
  const pageNumber = Math.max(1, Number.parseInt(page, 10) || 1)
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 20))
  const offset = (pageNumber - 1) * pageSize
  const conditions = []
  const params = []

  if (search.trim()) {
    const value = `%${search.trim()}%`
    conditions.push(`(
      a.action LIKE ? OR a.entity_type LIKE ? OR a.reason LIKE ? OR
      CAST(a.entity_id AS CHAR) LIKE ? OR u.first_name LIKE ? OR
      u.last_name LIKE ? OR u.email LIKE ?
    )`)
    params.push(value, value, value, value, value, value, value)
  }
  if (action) {
    conditions.push('a.action = ?')
    params.push(action)
  }
  if (entityType) {
    conditions.push('a.entity_type = ?')
    params.push(entityType)
  }
  if (dateFrom) {
    conditions.push('a.created_at >= ?')
    params.push(`${dateFrom} 00:00:00`)
  }
  if (dateTo) {
    conditions.push('a.created_at < DATE_ADD(?, INTERVAL 1 DAY)')
    params.push(`${dateTo} 00:00:00`)
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const orderColumn = sortableColumns[sort] || sortableColumns.date
  const orderDirection =
    String(direction).toLowerCase() === 'asc' ? 'ASC' : 'DESC'
  const rows = await query(
    `SELECT a.*, u.first_name, u.last_name, u.email
     FROM audit_logs a
     LEFT JOIN users u ON u.id = a.user_id
     ${where}
     ORDER BY ${orderColumn} ${orderDirection}, a.id ${orderDirection}
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  )
  const [countRow] = await query(
    `SELECT COUNT(*) AS total
     FROM audit_logs a
     LEFT JOIN users u ON u.id = a.user_id
     ${where}`,
    params
  )
  const totalItems = Number(countRow?.total || 0)

  return {
    data: rows,
    pagination: {
      page: pageNumber,
      limit: pageSize,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / pageSize))
    }
  }
}
