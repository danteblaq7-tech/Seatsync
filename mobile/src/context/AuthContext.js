import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react'
import {
  api,
  refreshTokens,
  setAccessToken,
  setSessionExpiredHandler
} from '../api/client'
import { tokenStorage } from '../api/storage'

const AuthContext = createContext(null)

export function AuthProvider ({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setSessionExpiredHandler(() => setUser(null))

    const bootstrap = async () => {
      try {
        const response = await refreshTokens()
        if (response?.user) setUser(response.user)
      } catch {
        setUser(null)
      } finally {
        setLoading(false)
      }
    }
    bootstrap()
  }, [])

  const persistSession = useCallback(async response => {
    setAccessToken(response.accessToken)
    await tokenStorage.set({
      accessToken: response.accessToken,
      refreshToken: response.refreshToken
    })
    setUser(response.user)
  }, [])

  const login = useCallback(
    async credentials => {
      const response = await api.post('/api/auth/login', credentials)
      await persistSession(response)
      return response
    },
    [persistSession]
  )

  const register = useCallback(
    async payload => {
      const response = await api.post('/api/auth/register', payload)
      await persistSession(response)
      return response
    },
    [persistSession]
  )

  const logout = useCallback(async () => {
    try {
      await api.post('/api/auth/logout', {})
    } catch {
      /* local sign-out below is what matters on mobile */
    } finally {
      setAccessToken(null)
      await tokenStorage.clear()
      setUser(null)
    }
  }, [])

  const value = useMemo(
    () => ({ user, setUser, login, register, logout, loading }),
    [user, loading, login, register, logout]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth () {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
