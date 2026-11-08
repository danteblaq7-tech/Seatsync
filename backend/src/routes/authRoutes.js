import express from 'express'
import {
  register,
  login,
  refresh,
  registrationOptions,
  profileStatus,
  studentAcademicProfile,
  updateStudentProfile,
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
router.get(
  '/student-profile',
  requireAuth,
  requireRole('STUDENT', 'CLASS_REP'),
  studentAcademicProfile
)
router.put(
  '/student-profile',
  requireAuth,
  requireRole('STUDENT', 'CLASS_REP'),
  updateStudentProfile
)
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
