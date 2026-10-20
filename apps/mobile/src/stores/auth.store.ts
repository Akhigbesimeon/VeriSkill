import { create } from 'zustand'
import * as SecureStore from 'expo-secure-store'
import api from '@/lib/api'

export type Role = 'developer' | 'peer_verifier' | 'expert_verifier' | 'administrator' | 'recruiter'

interface AuthUser {
  id: string
  email: string
  role: Role
  displayName: string
  bio?: string | null
  location?: string | null
  company?: string | null
  createdAt?: string
}

interface UpdateProfilePayload {
  displayName?: string
  bio?: string | null
  location?: string | null
  company?: string | null
}

interface AuthState {
  user: AuthUser | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (data: RegisterData) => Promise<void>
  logout: () => Promise<void>
  loadMe: () => Promise<void>
  updateProfile: (patch: UpdateProfilePayload) => Promise<void>
}

interface RegisterData {
  email: string
  password: string
  displayName: string
  role: 'developer' | 'recruiter'
  walletType: 'managed' | 'self_custody'
  walletAddress?: string
}

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  isLoading: false,

  login: async (email, password) => {
    set({ isLoading: true })
    try {
      const { data } = await api.post('/auth/login', { email, password })
      await SecureStore.setItemAsync('accessToken', data.accessToken)
      await SecureStore.setItemAsync('refreshToken', data.refreshToken)
      set({ user: data.user, isLoading: false })
    } catch (err) {
      set({ isLoading: false })
      throw err
    }
  },

  register: async (payload: RegisterData) => {
    set({ isLoading: true })
    try {
      const { data } = await api.post('/auth/register', payload)
      await SecureStore.setItemAsync('accessToken', data.accessToken)
      await SecureStore.setItemAsync('refreshToken', data.refreshToken)
      set({ user: data.user, isLoading: false })
    } catch (err) {
      set({ isLoading: false })
      throw err
    }
  },

  logout: async () => {
    await SecureStore.deleteItemAsync('accessToken')
    await SecureStore.deleteItemAsync('refreshToken')
    set({ user: null })
  },

  loadMe: async () => {
    const token = await SecureStore.getItemAsync('accessToken')
    if (!token) return
    try {
      const { data } = await api.get('/auth/me')
      set({ user: data.user })
    } catch {
      await SecureStore.deleteItemAsync('accessToken')
      await SecureStore.deleteItemAsync('refreshToken')
      set({ user: null })
    }
  },

  updateProfile: async (patch) => {
    const { data } = await api.patch('/auth/me', patch)
    set({ user: data.user })
  },
}))
