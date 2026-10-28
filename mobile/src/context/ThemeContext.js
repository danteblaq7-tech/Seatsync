import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { Appearance } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import { useAuth } from './AuthContext'
import { setActivePalette } from '../theme'

const ThemeContext = createContext(null)
const THEME_KEY = 'seatsync.theme'
const rolePriority = ['ADMIN', 'LECTURER', 'CLASS_REP', 'STUDENT']

function resolveRole (roles = []) {
  const role = rolePriority.find(item => roles.includes(item))
  return (role || 'STUDENT').toLowerCase()
}

export function ThemeProvider ({ children }) {
  const { user } = useAuth()
  const [theme, setThemeState] = useState('light')
  const [loading, setLoading] = useState(true)
  const role = resolveRole(user?.roles)

  setActivePalette(theme, role)

  useEffect(() => {
    if (typeof Appearance.setColorScheme === 'function') {
      Appearance.setColorScheme(theme)
    }
  }, [theme])

  useEffect(() => {
    let active = true
    SecureStore.getItemAsync(THEME_KEY)
      .then(saved => {
        if (active && (saved === 'light' || saved === 'dark')) setThemeState(saved)
      })
      .catch(error => {
        console.warn('[SeatSync] Unable to load theme preference:', error?.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  const setTheme = useCallback(async nextTheme => {
    if (nextTheme !== 'light' && nextTheme !== 'dark') {
      throw new Error(`Unsupported theme: ${nextTheme}`)
    }
    setThemeState(nextTheme)
    try {
      await SecureStore.setItemAsync(THEME_KEY, nextTheme)
    } catch (error) {
      console.warn('[SeatSync] Unable to save theme preference:', error?.message)
    }
  }, [])

  const value = useMemo(() => ({
    theme,
    role,
    loading,
    setTheme,
    toggleTheme: () => setTheme(theme === 'light' ? 'dark' : 'light')
  }), [theme, role, loading, setTheme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme () {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used within ThemeProvider')
  return context
}
