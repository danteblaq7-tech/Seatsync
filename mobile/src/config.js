/**
 * Point this at your SeatSync backend (the Express + Socket.IO server in /backend, port 3000 by default).
 *
 *  - Android emulator → http://10.0.2.2:3000
 *  - iOS simulator    → http://localhost:3000
 *  - Physical device  → http://<your-computer-LAN-ip>:3000   (phone and computer on the same Wi-Fi)
 *
 * With Expo you can also set EXPO_PUBLIC_API_URL in your .env.
 */
export const API_URL = (
  (typeof process !== 'undefined' && process.env && process.env.EXPO_PUBLIC_API_URL) ||
  'http://10.0.2.2:3000'
).replace(/\/$/, '')

export default { API_URL }
