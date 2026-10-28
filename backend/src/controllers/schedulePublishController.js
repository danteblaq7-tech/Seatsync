import {
  publishScheduleDrafts,
  validateScheduleDraft
} from '../services/schedulePublishService.js'
import {
  createScheduleDraft,
  deleteScheduleDraft,
  listScheduleDrafts,
  updateScheduleDraft
} from '../services/scheduleDraftService.js'
import { emitSocketEvent } from '../socket/socketEvents.js'

export const validateScheduleDraftController = async (req, res) => {
  try {
    await validateScheduleDraft(
      req.body?.draft,
      req.body?.pendingDrafts,
      req.user
    )
    return res.json({ valid: true })
  } catch (error) {
    return res.status(409).json({ valid: false, message: error.message })
  }
}

export const listScheduleDraftsController = async (req, res) => {
  return res.json({ data: await listScheduleDrafts(req.user) })
}

export const createScheduleDraftController = async (req, res) => {
  try {
    const draft = await createScheduleDraft(
      req.body?.kind,
      req.body?.payload,
      req.user,
      req.body?.id
    )
    return res.status(201).json({ data: draft })
  } catch (error) {
    return res.status(409).json({ message: error.message })
  }
}

export const updateScheduleDraftController = async (req, res) => {
  try {
    const draft = await updateScheduleDraft(
      req.params.id,
      req.body?.payload,
      req.user
    )
    return res.json({ data: draft })
  } catch (error) {
    const status = error.message.includes('not found') ? 404 : 409
    return res.status(status).json({ message: error.message })
  }
}

export const deleteScheduleDraftController = async (req, res) => {
  try {
    const deleted = await deleteScheduleDraft(req.params.id, req.user)
    if (!deleted)
      return res.status(404).json({ message: 'Pending draft not found.' })
    return res.json({ success: true })
  } catch (error) {
    return res.status(403).json({ message: error.message })
  }
}

export const publishScheduleDraftsController = async (req, res) => {
  try {
    const data = await publishScheduleDrafts(req.body?.draftIds, req.user)
    if (data?.length) {
      console.info('[SCHEDULE][PUBLISHED]', JSON.stringify(data))
      emitSocketEvent('timetable:changed', {
        action: 'published',
        ids: data.map(item => Number(item.id)).filter(Boolean)
      })
    }
    return res.json({ success: true, data })
  } catch (error) {
    return res.status(409).json({
      success: false,
      message:
        error.message ||
        'Unable to publish schedule drafts. No changes were committed.'
    })
  }
}
