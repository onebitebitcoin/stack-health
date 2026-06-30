import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface User {
  id: number
  email: string | null
  username: string
  lightning_address: string | null
  avatar_url: string | null
  is_admin: boolean
  app_settings: Record<string, unknown>
}

interface AuthState {
  token: string | null
  refreshToken: string | null
  user: User | null
  login: (token: string, user: User, refreshToken?: string | null) => void
  logout: () => void
  setUser: (user: User) => void
  setTokens: (token: string, refreshToken: string) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      refreshToken: null,
      user: null,
      login: (token, user, refreshToken) =>
        set((s) => ({ token, user, refreshToken: refreshToken ?? s.refreshToken })),
      logout: () => set({ token: null, refreshToken: null, user: null }),
      setUser: (user) => set({ user }),
      setTokens: (token, refreshToken) => set({ token, refreshToken }),
    }),
    { name: 'auth' },
  ),
)
