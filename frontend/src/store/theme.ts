import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const THEMES = ['sapphire', 'volt', 'indigo', 'arctic', 'forest'] as const
export type Theme = (typeof THEMES)[number]

export const THEME_LABELS: Record<Theme, string> = {
  sapphire: 'Sapphire',
  volt: 'Volt Dark',
  indigo: 'Royal Indigo',
  arctic: 'Arctic Light',
  forest: 'Forest Light',
}

interface ThemeState {
  theme: Theme
  setTheme: (t: Theme) => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'sapphire',
      setTheme: (theme) => {
        document.documentElement.setAttribute('data-theme', theme)
        set({ theme })
      },
    }),
    { name: 'app-theme' },
  ),
)

export function initTheme(override?: string | null) {
  const stored = useThemeStore.getState().theme
  const t = (override && THEMES.includes(override as Theme) ? override : stored) as Theme
  document.documentElement.setAttribute('data-theme', t)
}
