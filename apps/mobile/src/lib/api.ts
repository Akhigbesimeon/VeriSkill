import axios from 'axios'
import * as SecureStore from 'expo-secure-store'

// Set EXPO_PUBLIC_API_URL in a .env file (or EAS secrets) to point at staging/prod.
// On a physical device the localhost fallback will not work — use the LAN IP of
// your dev machine, e.g. EXPO_PUBLIC_API_URL=http://192.168.1.42:4000/api/v1
const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1'
const MOBILE_KEY = process.env.EXPO_PUBLIC_MOBILE_KEY ?? ''

const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    ...(MOBILE_KEY ? { 'X-Mobile-Key': MOBILE_KEY } : {}),
  },
  timeout: 15_000,
})

api.interceptors.request.use(async config => {
  const token = await SecureStore.getItemAsync('accessToken')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  res => res,
  async err => {
    const original = err.config
    if (err.response?.status === 401 && !original._retried) {
      original._retried = true
      const refreshToken = await SecureStore.getItemAsync('refreshToken')
      if (refreshToken) {
        try {
          const { data } = await api.post('/auth/refresh', { refreshToken })
          await SecureStore.setItemAsync('accessToken', data.accessToken)
          await SecureStore.setItemAsync('refreshToken', data.refreshToken)
          original.headers.Authorization = `Bearer ${data.accessToken}`
          return api(original)
        } catch {
          await SecureStore.deleteItemAsync('accessToken')
          await SecureStore.deleteItemAsync('refreshToken')
        }
      }
    }
    return Promise.reject(err)
  }
)

export default api

/** Pulls the backend's `error` field off an axios error, or returns the fallback. */
export function extractErrorMessage(err: unknown, fallback: string): string {
  const r = (err as { response?: { data?: { error?: string } } }).response
  return r?.data?.error ?? fallback
}
