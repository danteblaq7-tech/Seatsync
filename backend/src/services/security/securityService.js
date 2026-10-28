import { createRow, query } from '../../repositories/sqlRepository.js'

const rolePermissions = {
  ADMIN: [
    'CREATE_TIMETABLE',
    'UPDATE_TIMETABLE',
    'DELETE_TIMETABLE',
    'BLOCK_VENUE',
    'APPROVE_OVERRIDE',
    'VIEW_AUDIT_LOGS',
    'MANAGE_USERS'
  ],
  LECTURER: [
    'VIEW_OWN_TIMETABLE',
    'VIEW_VENUE_AVAILABILITY',
    'REQUEST_OVERRIDE'
  ],
  STUDENT: ['VIEW_OWN_TIMETABLE', 'VIEW_EXAM_SCHEDULE'],
  CLASS_REP: ['VIEW_COHORT_TIMETABLE', 'VIEW_CHANGES', 'RECEIVE_NOTIFICATIONS']
}

export const createAuditLog = async ({
  userId,
  action,
  entityType,
  entityId,
  oldValues,
  newValues,
  reason,
  ipAddress,
  userAgent
}) => {
  const record = await createRow('audit_logs', {
    user_id: userId || null,
    action,
    entity_type: entityType,
    entity_id: Number(entityId),
    old_values: oldValues,
    new_values: newValues,
    reason,
    ip_address: ipAddress,
    user_agent: userAgent
  })

  return {
    valid: true,
    data: {
      ...record,
      userId: record.userId ?? record.user_id,
      entityType: record.entityType ?? record.entity_type,
      entityId: record.entityId ?? record.entity_id,
      oldValues: record.oldValues ?? record.old_values,
      newValues: record.newValues ?? record.new_values,
      ipAddress: record.ipAddress ?? record.ip_address,
      userAgent: record.userAgent ?? record.user_agent
    }
  }
}

export const authorizeAction = async ({ userRoles = [], action }) => {
  const roles = Array.isArray(userRoles) ? userRoles : [userRoles]

  for (const role of roles) {
    const permissions = rolePermissions[role] || []
    if (permissions.includes(action)) {
      return { allowed: true }
    }
  }

  return {
    allowed: false,
    reason: 'ROLE_NOT_ALLOWED'
  }
}
