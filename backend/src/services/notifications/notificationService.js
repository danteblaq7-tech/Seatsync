import {
  createRow,
  listRows,
  query,
  updateRow
} from '../../repositories/sqlRepository.js'
import { emitSocketEvent } from '../../socket/socketEvents.js'

const serializeNotification = record => ({
  ...record,
  userId: record.userId ?? record.user_id,
  entityType: record.entityType ?? record.entity_type,
  entityId: record.entityId ?? record.entity_id,
  isRead: record.isRead ?? Boolean(record.is_read),
  readAt: record.readAt ?? record.read_at,
  createdAt: record.createdAt ?? record.created_at,
  updatedAt: record.updatedAt ?? record.updated_at
})

export const createNotification = async ({
  userId,
  type,
  title,
  message,
  entityType,
  entityId
}) => {
  const record = await createRow('notifications', {
    user_id: Number(userId),
    type,
    title,
    message,
    entity_type: entityType,
    entity_id: Number(entityId),
    is_read: false,
    read_at: null
  })

  const serialized = serializeNotification(record)
  emitSocketEvent('notification:new', serialized)
  return serialized
}

export const listNotifications = async (userId = null) => {
  const rows = await listRows('notifications')
  const records = rows.map(serializeNotification)
  return userId
    ? records.filter(item => Number(item.userId) === Number(userId))
    : records
}

export const markNotificationRead = async id => {
  const notification = await updateRow('notifications', id, {
    is_read: true,
    read_at: new Date().toISOString()
  })
  if (!notification) return null

  const serialized = serializeNotification(notification)
  emitSocketEvent('notification:read', serialized)
  return serialized
}
