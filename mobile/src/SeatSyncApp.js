import React, { useState } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useFonts } from 'expo-font'
import { AuthProvider } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import AppNavigator from './navigation/AppNavigator'
import { ToastHost } from './components/Toast'

/**
 * Drop-in root. Render <SeatSyncApp /> from your App.js, or mount the pieces yourself:
 *   SafeAreaProvider > QueryClientProvider > AuthProvider > AppNavigator (+ ToastHost)
 * If your app already has a NavigationContainer, render <AppShell/> contents inside it instead
 * (see README "Integrating into an existing navigator").
 */
export default function SeatSyncApp () {
  const [queryClient] = useState(() => new QueryClient())
  const [fontsLoaded, fontError] = useFonts({
    Lexend_400Regular: require('@expo-google-fonts/lexend/400Regular/Lexend_400Regular.ttf'),
    Lexend_500Medium: require('@expo-google-fonts/lexend/500Medium/Lexend_500Medium.ttf'),
    Lexend_600SemiBold: require('@expo-google-fonts/lexend/600SemiBold/Lexend_600SemiBold.ttf'),
    Lexend_700Bold: require('@expo-google-fonts/lexend/700Bold/Lexend_700Bold.ttf'),
    Orbitron_400Regular: require('@expo-google-fonts/orbitron/400Regular/Orbitron_400Regular.ttf'),
    Orbitron_500Medium: require('@expo-google-fonts/orbitron/500Medium/Orbitron_500Medium.ttf'),
    Orbitron_600SemiBold: require('@expo-google-fonts/orbitron/600SemiBold/Orbitron_600SemiBold.ttf'),
    Orbitron_700Bold: require('@expo-google-fonts/orbitron/700Bold/Orbitron_700Bold.ttf')
  })

  if (fontError) throw fontError
  if (!fontsLoaded) return null

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ThemeProvider>
            <AppNavigator />
            <ToastHost />
          </ThemeProvider>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  )
}
