import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { api } from '../api/client'

const AuthContext = createContext(null)

export function AuthProvider ({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const response = await api.post('/api/auth/refresh', {})
        if (response?.user) {
          setUser(response.user)
        }
      } catch {
        setUser(null)
      } finally {
        setLoading(false)
      }
    }

    bootstrap()
  }, [])

  const login = async credentials => {
    const response = await api.post('/api/auth/login', credentials)
    setUser(response.user)
    return response
  }

  const register = async payload => {
    const response = await api.post('/api/auth/register', payload)
    setUser(response.user)
    return response
  }

  const logout = async () => {
    try {
      await api.post('/api/auth/logout', {})
    } finally {
      setUser(null)
    }
  }

  const value = useMemo(
    () => ({ user, setUser, login, register, logout, loading }),
    [user, loading]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth () {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
