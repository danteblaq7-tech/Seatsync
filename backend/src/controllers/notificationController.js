import {
  listNotifications,
  markNotificationRead
} from '../services/notifications/notificationService.js'

export const listNotificationsController = async (req, res) => {
  const userId = req.query.userId || req.user?.id
  res.json({ data: await listNotifications(userId) })
}

export const markNotificationReadController = async (req, res) => {
  const notification = await markNotificationRead(req.params.id)
  if (!notification)
    return res.status(404).json({ message: 'Notification not found' })
  return res.json({ data: notification })
}
