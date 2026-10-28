import express from 'express'
import {
  listNotificationsController,
  markNotificationReadController
} from '../controllers/notificationController.js'
import { requireRole } from '../middleware/authMiddleware.js'

const router = express.Router()

router.get(
  '/',
  requireRole('ADMIN', 'LECTURER', 'STUDENT', 'CLASS_REP'),
  listNotificationsController
)
router.patch(
  '/:id/read',
  requireRole('ADMIN', 'LECTURER', 'STUDENT', 'CLASS_REP'),
  markNotificationReadController
)

export default router
