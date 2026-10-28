import { randomUUID } from 'node:crypto'
import db from '../config/db.js'
import { validateScheduleDraft } from './schedulePublishService.js'

const parseDraftRow = row => ({
  id: row.id,
  kind: row.kind,
  payload:
    typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
  createdBy: Number(row.created_by),
  createdAt: row.created_at,
  updatedAt: row.updated_at
})

const canManageAllDrafts = actor => (actor?.roles || []).includes('ADMIN')

const canManageDraft = (draft, actor) =>
  canManageAllDrafts(actor) ||
  ((actor?.roles || []).includes('LECTURER') &&
    draft.kind === 'timetable' &&
    Number(draft.createdBy) === Number(actor.id))

const assertAllowedDraftKind = (kind, actor) => {
  if (['ADMIN'].some(role => (actor?.roles || []).includes(role))) {
    if (['timetable', 'timetable_update', 'exam', 'exam_update'].includes(kind))
      return
  }
  if ((actor?.roles || []).includes('LECTURER') && kind === 'timetable') {
    return
  }
  throw new Error('You are not allowed to manage this schedule draft.')
}

export const listScheduleDrafts = async actor => {
  const admin = canManageAllDrafts(actor)
  const [rows] = await db.execute(
    `SELECT * FROM schedule_drafts
     ${admin ? '' : "WHERE created_by = ? AND kind = 'timetable'"}
     ORDER BY created_at, id`,
    admin ? [] : [Number(actor.id)]
  )
  return rows.map(parseDraftRow)
}

export const createScheduleDraft = async (
  kind,
  payload,
  actor,
  requestedId
) => {
  assertAllowedDraftKind(kind, actor)
  const draft = {
    id: String(requestedId || randomUUID()),
    kind,
    payload,
    createdBy: Number(actor.id)
  }
  const existingDrafts = await listScheduleDraftsForValidation()
  await validateScheduleDraft(draft, existingDrafts, actor)
  await db.execute(
    `INSERT INTO schedule_drafts (id, kind, payload, created_by)
     VALUES (?, ?, ?, ?)`,
    [draft.id, draft.kind, JSON.stringify(draft.payload), draft.createdBy]
  )
  return draft
}

export const updateScheduleDraft = async (id, payload, actor) => {
  const [rows] = await db.execute(
    'SELECT * FROM schedule_drafts WHERE id = ?',
    [String(id)]
  )
  if (!rows.length) throw new Error('Pending schedule draft not found.')
  const draft = parseDraftRow(rows[0])
  if (!canManageDraft(draft, actor)) {
    throw new Error('You are not allowed to edit this schedule draft.')
  }
  const updated = { ...draft, payload }
  const otherDrafts = await listScheduleDraftsForValidation(id)
  await validateScheduleDraft(updated, otherDrafts, actor)
  await db.execute(
    'UPDATE schedule_drafts SET payload = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [JSON.stringify(payload), String(id)]
  )
  return updated
}

export const deleteScheduleDraft = async (id, actor) => {
  const [rows] = await db.execute(
    'SELECT * FROM schedule_drafts WHERE id = ?',
    [String(id)]
  )
  if (!rows.length) return false
  const draft = parseDraftRow(rows[0])
  if (!canManageDraft(draft, actor)) {
    throw new Error('You are not allowed to remove this schedule draft.')
  }
  const [result] = await db.execute(
    'DELETE FROM schedule_drafts WHERE id = ?',
    [String(id)]
  )
  return result.affectedRows > 0
}

const listScheduleDraftsForValidation = async (excludeId = null) => {
  const [rows] = await db.execute(
    `SELECT * FROM schedule_drafts ${
      excludeId ? 'WHERE id <> ?' : ''
    } ORDER BY created_at, id`,
    excludeId ? [String(excludeId)] : []
  )
  return rows.map(parseDraftRow)
}
