import { query } from '../../repositories/sqlRepository.js'

export const pingDatabase = async () => {
  try {
    const rows = await query('SELECT 1 AS ok')
    return { ok: true, data: rows[0] }
  } catch (error) {
    return { ok: false, error: error.message }
  }
}

export const getDatabaseStatus = async () => {
  const result = await pingDatabase()
  return {
    connected: result.ok,
    message: result.ok ? 'MySQL connection available' : result.error
  }
}
