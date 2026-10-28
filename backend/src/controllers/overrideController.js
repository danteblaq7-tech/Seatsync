import { createScheduleOverride } from '../services/scheduling/overrideService.js'
import { createAuditLog } from '../services/security/securityService.js'

export const createScheduleOverrideController = async (req, res) => {
  const result = await createScheduleOverride({
    ...req.body,
    createdBy: req.user?.id,
    requesterUserId: req.user?.id,
    requesterRoles: req.user?.roles || []
  })

  if (!result.valid) {
    return res.status(409).json({ valid: false, conflicts: result.conflicts })
  }

  await createAuditLog({
    userId: req.user?.id,
    action: 'CREATE_MAKEUP_CLASS',
    entityType: 'schedule_override',
    entityId: result.data.id,
    oldValues: null,
    newValues: result.data,
    reason: req.body.reason,
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  })

  return res.status(201).json({ valid: true, data: result.data })
}
