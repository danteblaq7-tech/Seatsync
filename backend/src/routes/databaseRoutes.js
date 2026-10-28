import express from 'express'
import { databaseStatusController } from '../controllers/databaseController.js'
import { requireRole } from '../middleware/authMiddleware.js'

const router = express.Router()

router.get('/status', requireRole('ADMIN'), databaseStatusController)

export default router
