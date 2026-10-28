import { listAuditLogs } from '../services/security/auditLogService.js'

export const getAuditLogs = async (req, res) => {
  res.json(await listAuditLogs(req.query))
}
