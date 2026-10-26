import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import api from '@/lib/api'

export type Role = 'developer' | 'peer_verifier' | 'expert_verifier' | 'administrator' | 'recruiter'
export type WalletType = 'managed' | 'self_custody'

/** Where this role should land after login (and when they hit /dashboard directly). */
export function landingPathFor(role: Role | undefined): string {
  switch (role) {
    case 'expert_verifier':
    case 'peer_verifier':                     return '/reviews'
    case 'recruiter':                         return '/verify'
    default:                                  return '/dashboard'
  }
}

interface AuthUser {
  id: string
  email: string
  role: Role
  displayName: string
  bio?: string | null
  location?: string | null
  externalLinks?: string[]
  walletType?: WalletType
  walletAddress?: string | null
}

export interface ProfileUpdate {
  displayName?: string
  bio?: string | null
  location?: string | null
  externalLinks?: string[]
}

interface AuthState {
  user: AuthUser | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (data: RegisterData) => Promise<void>
  updateProfile: (data: ProfileUpdate) => Promise<void>
  updateWallet: (walletType: WalletType, walletAddress?: string) => Promise<void>
  logout: () => void
  loadMe: () => Promise<void>
}

interface RegisterData {
  email: string
  password: string
  displayName: string
  role: 'developer'
  walletType: WalletType
  walletAddress?: string
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isLoading: false,

      login: async (email, password) => {
        set({ isLoading: true })
        try {
          const { data } = await api.post('/auth/login', { email, password })
          localStorage.setItem('accessToken', data.accessToken)
          localStorage.setItem('refreshToken', data.refreshToken)
          set({ user: data.user, isLoading: false })
        } catch (err) {
          set({ isLoading: false })
          throw err
        }
      },

      register: async (data: RegisterData) => {
        set({ isLoading: true })
        try {
          const { data: res } = await api.post('/auth/register', data)
          localStorage.setItem('accessToken', res.accessToken)
          localStorage.setItem('refreshToken', res.refreshToken)
          set({ user: res.user, isLoading: false })
        } catch (err) {
          set({ isLoading: false })
          throw err
        }
      },

      updateProfile: async (data) => {
        const { data: res } = await api.patch('/auth/me', data)
        const current = get().user
        set({ user: current ? { ...current, ...res.user } : res.user })
      },

      updateWallet: async (walletType, walletAddress) => {
        const { data } = await api.patch('/auth/me/wallet', { walletType, walletAddress })
        const current = get().user
        set({ user: current ? { ...current, ...data.user } : data.user })
      },

      logout: () => {
        localStorage.removeItem('accessToken')
        localStorage.removeItem('refreshToken')
        set({ user: null })
      },

      loadMe: async () => {
        const token = localStorage.getItem('accessToken')
        if (!token) return
        try {
          const { data } = await api.get('/auth/me')
          set({ user: data.user })
        } catch {
          localStorage.removeItem('accessToken')
          localStorage.removeItem('refreshToken')
          set({ user: null })
        }
      },
    }),
    {
      name: 'veriskill-auth',
      partialize: (state) => ({ user: state.user }),
    }
  )
)
