import { API_BASE_URL } from '../config'

async function parseResponse (response) {
  const contentType = response.headers.get('content-type') || ''

  if (contentType.includes('application/json')) {
    const data = await response.json().catch(() => ({}))
    return { data, ok: response.ok }
  }

  const text = await response.text().catch(() => '')
  return { data: text ? { message: text } : {}, ok: response.ok }
}

export async function apiRequest (path, options = {}, retry = true) {
  const { headers = {}, body, ...rest } = options
  const requestOptions = {
    ...rest,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...headers
    }
  }

  if (body !== undefined && !(body instanceof FormData)) {
    requestOptions.body = JSON.stringify(body)
  }

  const response = await fetch(`${API_BASE_URL}${path}`, requestOptions)
  const { data, ok } = await parseResponse(response)

  if (response.status === 401 && retry && !path.includes('/api/auth/refresh')) {
    const refreshResult = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' }
    })

    if (refreshResult.ok) {
      return apiRequest(path, options, false)
    }
  }

  if (!ok) {
    const conflictMessages = Array.isArray(data?.conflicts)
      ? data.conflicts.map(conflict => conflict.message).filter(Boolean)
      : []
    const message =
      data?.message || conflictMessages.join(' ') || 'Request failed.'
    throw new Error(message)
  }

  return data
}

export const api = {
  get: (path, options = {}) => apiRequest(path, { ...options, method: 'GET' }),
  post: (path, body, options = {}) =>
    apiRequest(path, { ...options, method: 'POST', body }),
  put: (path, body, options = {}) =>
    apiRequest(path, { ...options, method: 'PUT', body }),
  patch: (path, body, options = {}) =>
    apiRequest(path, { ...options, method: 'PATCH', body }),
  del: (path, options = {}) =>
    apiRequest(path, { ...options, method: 'DELETE' })
}

export default api
