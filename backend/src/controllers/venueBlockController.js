import { createVenueBlock } from '../services/venues/venueBlockService.js'
import { query } from '../repositories/sqlRepository.js'

export const createVenueBlockController = async (req, res) => {
  const result = await createVenueBlock(req.body)

  if (!result.valid) {
    return res.status(400).json({ valid: false, conflicts: result.conflicts })
  }

  return res.status(201).json({ valid: true, data: result.data })
}

export const listVenueBlocksController = async (req, res) => {
  const rows = await query('SELECT * FROM venue_blocks ORDER BY id')
  res.json({ data: rows })
}
