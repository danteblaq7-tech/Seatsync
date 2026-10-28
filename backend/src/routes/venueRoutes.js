import express from 'express'
import {
  createVenueBlockController,
  listVenueBlocksController
} from '../controllers/venueBlockController.js'
import { requireRole } from '../middleware/authMiddleware.js'

const router = express.Router()

router.get('/', requireRole('ADMIN', 'LECTURER', 'STUDENT'), (req, res) => {
  res.json({ message: 'List venues endpoint ready.' })
})

router.get(
  '/availability',
  requireRole('ADMIN', 'LECTURER', 'STUDENT'),
  (req, res) => {
    res.json({ message: 'Venue availability endpoint ready.' })
  }
)

router.get(
  '/blocks',
  requireRole('ADMIN', 'LECTURER'),
  listVenueBlocksController
)
router.post(
  '/blocks',
  requireRole('ADMIN', 'LECTURER'),
  createVenueBlockController
)

export default router
