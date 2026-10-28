import express from 'express'
import {
  getTimetable,
  getAvailability
} from '../controllers/timetableController.js'
import { createScheduleOverrideController } from '../controllers/overrideController.js'
import { requireRole } from '../middleware/authMiddleware.js'

const router = express.Router()

router.get(
  '/',
  requireRole('ADMIN', 'LECTURER', 'STUDENT', 'CLASS_REP'),
  getTimetable
)
router.get(
  '/availability',
  requireRole('ADMIN', 'LECTURER', 'STUDENT', 'CLASS_REP'),
  getAvailability
)
router.post(
  '/overrides',
  requireRole('ADMIN', 'LECTURER'),
  createScheduleOverrideController
)

export default router
