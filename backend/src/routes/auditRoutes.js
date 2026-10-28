import express from 'express'
import { getAuditLogs } from '../controllers/auditLogController.js'
import { requireRole } from '../middleware/authMiddleware.js'

const router = express.Router()

router.get('/logs', requireRole('ADMIN'), getAuditLogs)

export default router
