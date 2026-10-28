import express from 'express'
import { dashboardSummaryController } from '../controllers/dashboardController.js'
import { requireRole } from '../middleware/authMiddleware.js'

const router = express.Router()

router.get(
  '/',
  requireRole('ADMIN', 'LECTURER', 'STUDENT', 'CLASS_REP'),
  dashboardSummaryController
)

export default router
