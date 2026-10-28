import {
  listUsers,
  createUser,
  getUser,
  setUserActive
} from '../services/userService.js'
import { createAuditLog } from '../services/security/securityService.js'

export const listUsersController = async (req, res) => {
  const result = await listUsers(req.query)
  if (Array.isArray(result)) return res.json({ data: result })
  return res.json(result)
}

export const createUserController = async (req, res) => {
  const user = await createUser(req.body)
  res.status(201).json({ data: user })
}

export const getUserController = async (req, res) => {
  const user = await getUser(req.params.id)
  if (!user) return res.status(404).json({ message: 'User not found' })
  return res.json({ data: user })
}

export const setUserStatusController = async (req, res) => {
  const id = Number(req.params.id)
  const isActive = req.body?.is_active
  if (!Number.isInteger(id) || id <= 0 || typeof isActive !== 'boolean') {
    return res
      .status(400)
      .json({ message: 'A valid user ID and is_active boolean are required.' })
  }
  if (id === Number(req.user?.id) && !isActive) {
    return res
      .status(400)
      .json({ message: 'You cannot block your own account.' })
  }

  const oldValues = await getUser(id)
  if (!oldValues) return res.status(404).json({ message: 'User not found.' })
  const user = await setUserActive(id, isActive)
  await createAuditLog({
    userId: req.user?.id,
    action: isActive ? 'UNBLOCK_USER' : 'BLOCK_USER',
    entityType: 'user',
    entityId: id,
    oldValues: { isActive: oldValues.isActive },
    newValues: { isActive: user.isActive },
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  })
  return res.json({ data: user })
}
