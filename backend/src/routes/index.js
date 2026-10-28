import express from 'express'

const router = express.Router()

router.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'SeatSync API' })
})

router.get('/auth/register', (req, res) => {
  res.json({ message: 'Register endpoint ready.' })
})

router.get('/auctions', (req, res) => {
  res.json({ message: 'API routes scaffolded for SeatSync.' })
})

export default router
