import express from 'express'
import {
  listUsersController,
  createUserController,
  getUserController,
  setUserStatusController
} from '../controllers/userController.js'
import { requireRole } from '../middleware/authMiddleware.js'

const router = express.Router()

router.get('/', requireRole('ADMIN'), listUsersController)
router.post('/', requireRole('ADMIN'), createUserController)
router.patch('/:id/status', requireRole('ADMIN'), setUserStatusController)
router.get('/:id', requireRole('ADMIN'), getUserController)

export default router
