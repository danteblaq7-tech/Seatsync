import express from 'express'
import {
  deleteExamController,
  listExamsController
} from '../controllers/examController.js'
import { requireRole } from '../middleware/authMiddleware.js'

const router = express.Router()

router.get(
  '/',
  requireRole('ADMIN', 'LECTURER', 'STUDENT', 'CLASS_REP'),
  listExamsController
)
router.delete('/:id', requireRole('ADMIN'), deleteExamController)
export default router
