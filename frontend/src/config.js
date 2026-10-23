export const API_BASE_URL = import.meta.env.VITE_API_URL?.replace(/\/$/, '')
export const SOCKET_BASE_URL = (
  import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_API_URL
)?.replace(/\/$/, '')
