import express from 'express'
import {
  createScheduleDraftController,
  deleteScheduleDraftController,
  listScheduleDraftsController,
  publishScheduleDraftsController,
  updateScheduleDraftController,
  validateScheduleDraftController
} from '../controllers/schedulePublishController.js'
import { requireRole } from '../middleware/authMiddleware.js'

const router = express.Router()

router.get(
  '/drafts',
  requireRole('ADMIN', 'LECTURER'),
  listScheduleDraftsController
)
router.post(
  '/drafts',
  requireRole('ADMIN', 'LECTURER'),
  createScheduleDraftController
)
router.put(
  '/drafts/:id',
  requireRole('ADMIN', 'LECTURER'),
  updateScheduleDraftController
)
router.delete(
  '/drafts/:id',
  requireRole('ADMIN', 'LECTURER'),
  deleteScheduleDraftController
)
router.post(
  '/validate',
  requireRole('ADMIN', 'LECTURER'),
  validateScheduleDraftController
)
router.post(
  '/publish',
  requireRole('ADMIN', 'LECTURER'),
  publishScheduleDraftsController
)

export default router
