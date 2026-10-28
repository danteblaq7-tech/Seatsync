import * as SecureStore from 'expo-secure-store'

/**
 * Token storage. Swap this file's internals if you are not on Expo
 * (e.g. react-native-keychain or @react-native-async-storage/async-storage).
 */
const ACCESS_KEY = 'seatsync.accessToken'
const REFRESH_KEY = 'seatsync.refreshToken'

export const tokenStorage = {
  async getAccess () {
    try {
      return await SecureStore.getItemAsync(ACCESS_KEY)
    } catch {
      return null
    }
  },
  async getRefresh () {
    try {
      return await SecureStore.getItemAsync(REFRESH_KEY)
    } catch {
      return null
    }
  },
  async set ({ accessToken, refreshToken }) {
    try {
      if (accessToken) await SecureStore.setItemAsync(ACCESS_KEY, accessToken)
      if (refreshToken) await SecureStore.setItemAsync(REFRESH_KEY, refreshToken)
    } catch (error) {
      console.warn('[SeatSync] Unable to persist session tokens:', error?.message)
    }
  },
  async clear () {
    try {
      await SecureStore.deleteItemAsync(ACCESS_KEY)
      await SecureStore.deleteItemAsync(REFRESH_KEY)
    } catch {
      /* nothing to clear */
    }
  }
}

export default tokenStorage
