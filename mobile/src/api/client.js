import { API_URL } from '../config'
import { tokenStorage } from './storage'

/**
 * Same surface as the web client (`api.get/post/put/patch/del`, same error messages),
 * but token-based instead of cookie-based: the SeatSync backend already returns
 * `accessToken` / `refreshToken` in the login/register/refresh bodies, accepts
 * `Authorization: Bearer ...`, and accepts `{ refreshToken }` in the refresh body.
 */

let accessToken = null
let refreshPromise = null
let onSessionExpired = null

export const setSessionExpiredHandler = handler => {
  onSessionExpired = handler
}

export const setAccessToken = token => {
  accessToken = token || null
}

async function parseResponse (response) {
  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    const data = await response.json().catch(() => ({}))
    return { data, ok: response.ok }
  }
  const text = await response.text().catch(() => '')
  return { data: text ? { message: text } : {}, ok: response.ok }
}

/** Exchanges the stored refresh token for a new pair. De-duplicated across concurrent 401s. */
export async function refreshTokens () {
  if (refreshPromise) return refreshPromise

  refreshPromise = (async () => {
    const refreshToken = await tokenStorage.getRefresh()
    if (!refreshToken) return null

    const response = await fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken })
    })
    const { data, ok } = await parseResponse(response)
    if (!ok || !data?.accessToken) return null

    accessToken = data.accessToken
    await tokenStorage.set({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken
    })
    return data
  })().finally(() => {
    refreshPromise = null
  })

  return refreshPromise
}

export async function apiRequest (path, options = {}, retry = true) {
  const { headers = {}, body, ...rest } = options
  if (!accessToken) accessToken = await tokenStorage.getAccess()

  const requestOptions = {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...headers
    }
  }

  if (body !== undefined) {
    if (typeof FormData !== 'undefined' && body instanceof FormData) {
      delete requestOptions.headers['Content-Type']
      requestOptions.body = body
    } else {
      requestOptions.body = JSON.stringify(body)
    }
  }

  const response = await fetch(`${API_URL}${path}`, requestOptions)
  const { data, ok } = await parseResponse(response)

  if (
    response.status === 401 &&
    retry &&
    !path.includes('/api/auth/refresh') &&
    !path.includes('/api/auth/login')
  ) {
    const refreshed = await refreshTokens()
    if (refreshed) return apiRequest(path, options, false)
    if (typeof onSessionExpired === 'function') onSessionExpired()
  }

  if (!ok) {
    const conflictMessages = Array.isArray(data?.conflicts)
      ? data.conflicts.map(conflict => conflict.message).filter(Boolean)
      : []
    const message = data?.message || conflictMessages.join(' ') || 'Request failed.'
    const error = new Error(message)
    error.status = response.status
    error.data = data
    throw error
  }

  return data
}

export const api = {
  get: (path, options = {}) => apiRequest(path, { ...options, method: 'GET' }),
  post: (path, body, options = {}) => apiRequest(path, { ...options, method: 'POST', body }),
  put: (path, body, options = {}) => apiRequest(path, { ...options, method: 'PUT', body }),
  patch: (path, body, options = {}) => apiRequest(path, { ...options, method: 'PATCH', body }),
  del: (path, options = {}) => apiRequest(path, { ...options, method: 'DELETE' })
}

export default api
