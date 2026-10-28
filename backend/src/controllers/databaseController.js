import { getDatabaseStatus } from '../services/database/databaseService.js'

export const databaseStatusController = async (req, res) => {
  const status = await getDatabaseStatus()
  res.json(status)
}
