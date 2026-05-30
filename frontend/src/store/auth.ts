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
  user: User | null
  login: (token: string, user: User) => void
  logout: () => void
  setUser: (user: User) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      login: (token, user) => set({ token, user }),
      logout: () => set({ token: null, user: null }),
      setUser: (user) => set({ user }),
    }),
    { name: 'auth' },
  ),
)
