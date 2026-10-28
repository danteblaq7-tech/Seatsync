import express from 'express'
import {
  register,
  login,
  refresh,
  registrationOptions,
  profileStatus,
  completeProfile,
  lecturerProfile,
  updateLecturerProfile,
  logout
} from '../controllers/authController.js'
import {
  requireAuth,
  requireRefreshToken,
  requireRole
} from '../middleware/authMiddleware.js'

const router = express.Router()

router.post('/register', register)
router.get('/registration-options', registrationOptions)
router.get('/profile-status', requireAuth, profileStatus)
router.post('/complete-profile', requireAuth, completeProfile)
router.get(
  '/lecturer-profile',
  requireAuth,
  requireRole('LECTURER'),
  lecturerProfile
)
router.put(
  '/lecturer-profile',
  requireAuth,
  requireRole('LECTURER'),
  updateLecturerProfile
)
router.post('/login', login)
router.post('/refresh', requireRefreshToken, refresh)
router.post('/logout', logout)

export default router
