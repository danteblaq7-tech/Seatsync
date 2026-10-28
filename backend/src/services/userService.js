import {
  createRow,
  findById,
  listRows,
  query,
  updateRow
} from '../repositories/sqlRepository.js'

const serializeUser = row => ({
  ...row,
  firstName: row.firstName ?? row.first_name,
  lastName: row.lastName ?? row.last_name,
  phoneNumber: row.phoneNumber ?? row.phone_number,
  isActive: row.isActive ?? row.is_active,
  lastLoginAt: row.lastLoginAt ?? row.last_login_at,
  createdAt: row.createdAt ?? row.created_at,
  updatedAt: row.updatedAt ?? row.updated_at
})

const serializeRole = row => ({
  ...row,
  createdAt: row.createdAt ?? row.created_at,
  updatedAt: row.updatedAt ?? row.updated_at
})

const normalizeRoles = value => {
  if (!value) return []
  if (Array.isArray(value)) return value.filter(Boolean)
  return String(value)
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}

export const listUsers = async options => {
  const hasPagination = Boolean(
    options && (options.page !== undefined || options.limit !== undefined)
  )
  const page = Math.max(1, Number.parseInt(options?.page, 10) || 1)
  const limit = Math.min(
    100,
    Math.max(1, Number.parseInt(options?.limit, 10) || 20)
  )
  const offset = (page - 1) * limit
  const conditions = []
  const params = []

  if (options?.search?.trim()) {
    const pattern = `%${options.search.trim()}%`
    conditions.push(
      "(u.first_name LIKE ? OR u.last_name LIKE ? OR CONCAT(u.first_name, ' ', u.last_name) LIKE ? OR u.email LIKE ? OR u.phone_number LIKE ?)"
    )
    params.push(pattern, pattern, pattern, pattern, pattern)
  }
  if (options?.role) {
    conditions.push(
      'EXISTS (SELECT 1 FROM user_roles ur_filter JOIN roles r_filter ON r_filter.id = ur_filter.role_id WHERE ur_filter.user_id = u.id AND r_filter.name = ?)'
    )
    params.push(options.role)
  }
  if (options?.status === 'active') conditions.push('u.is_active = TRUE')
  if (options?.status === 'blocked') conditions.push('u.is_active = FALSE')

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const sortColumns = {
    name: 'u.last_name',
    email: 'u.email',
    role: 'roles',
    status: 'u.is_active',
    created: 'u.created_at'
  }
  const sortColumn = sortColumns[options?.sort] || 'u.last_name'
  const direction =
    String(options?.direction).toLowerCase() === 'desc' ? 'DESC' : 'ASC'
  const rows = await query(
    `
    SELECT u.*, GROUP_CONCAT(DISTINCT r.name ORDER BY r.name SEPARATOR ',') AS roles
    FROM users u
    LEFT JOIN user_roles ur ON ur.user_id = u.id
    LEFT JOIN roles r ON r.id = ur.role_id
    ${where}
    GROUP BY u.id
    ORDER BY ${sortColumn} ${direction}, u.id ${direction}
    ${hasPagination ? 'LIMIT ? OFFSET ?' : ''}
  `,
    hasPagination ? [...params, limit, offset] : params
  )

  const users = rows.map(row => {
    const user = serializeUser(row)
    delete user.password_hash
    delete user.passwordHash
    return {
      ...user,
      roles: normalizeRoles(row.roles)
    }
  })

  if (!hasPagination) return users

  const [countRow] = await query(
    `SELECT COUNT(DISTINCT u.id) AS total FROM users u ${where}`,
    params
  )
  const totalItems = Number(countRow?.total || 0)
  return {
    data: users,
    pagination: {
      page,
      limit,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / limit))
    }
  }
}

export const createUser = async payload => {
  const row = await createRow('users', payload)
  return row ? serializeUser(row) : null
}

export const getUser = async id => {
  const row = await findById('users', id)
  return row ? serializeUser(row) : null
}

export const updateUser = async (id, updates) => {
  const row = await updateRow('users', id, updates)
  return row ? serializeUser(row) : null
}

export const setUserActive = async (id, isActive) =>
  updateUser(id, { is_active: Boolean(isActive) })

export const listRoles = async () => {
  const rows = await listRows('roles')
  return rows.map(serializeRole)
}

export const createRole = async payload => {
  const row = await createRow('roles', payload)
  return row ? serializeRole(row) : null
}

export const getRole = async id => {
  const row = await findById('roles', id)
  return row ? serializeRole(row) : null
}

export const assignRoleToUser = async (userId, roleId) => {
  const user = await getUser(userId)
  const role = await getRole(roleId)

  if (!user || !role) return null

  const existing = await query(
    'SELECT * FROM user_roles WHERE user_id = ? AND role_id = ?',
    [userId, roleId]
  )
  if (existing.length) {
    return {
      userId: Number(userId),
      roleId: Number(roleId),
      createdAt: existing[0].created_at
    }
  }

  const row = await createRow('user_roles', {
    user_id: Number(userId),
    role_id: Number(roleId)
  })
  return row
    ? {
        userId: Number(row.user_id),
        roleId: Number(row.role_id),
        createdAt: row.created_at
      }
    : null
}
