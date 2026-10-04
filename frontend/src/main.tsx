import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import './i18n'
import { initTheme } from './store/theme'
import { useAuthStore } from './store/auth'
import App from './App.tsx'
import { removeBootSplash } from './utils/bootSplash'

const savedUser = useAuthStore.getState().user
initTheme(savedUser?.app_settings?.theme as string | null)

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('Root element not found')

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)

// 첫 렌더 직후 부팅 화면을 걷는다. 렌더가 실패해도 화면이 막히지 않도록 안전 타이머를 둔다.
requestAnimationFrame(removeBootSplash)
window.setTimeout(removeBootSplash, 8000)
