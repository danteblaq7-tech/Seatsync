import {
  createTimetableEntry,
  listTimetableEntries,
  listAvailability
} from '../services/timetableDomainService.js'

export const getTimetable = async (req, res) => {
  res.json({ data: await listTimetableEntries(req.user) })
}

export const addTimetableEntry = async (req, res) => {
  const result = await createTimetableEntry({
    ...req.body,
    created_by: req.user?.id,
    updated_by: req.user?.id,
    actor_user_id: req.user?.id,
    actor_roles: req.user?.roles || []
  })

  if (!result.valid) {
    return res.status(409).json({ valid: false, conflicts: result.conflicts })
  }

  return res.status(201).json({ valid: true, data: result.data })
}

export const getAvailability = async (req, res) => {
  const result = await listAvailability(req.query)
  res.json({ data: result })
}
