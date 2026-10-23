import { httpServer } from './app.js'

const PORT = Number(process.env.PORT || 3000)

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`SeatSync backend running on port ${PORT}`)
})
