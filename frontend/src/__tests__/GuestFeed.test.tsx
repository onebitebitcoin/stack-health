import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from '../App'
import { useAuthStore } from '../store/auth'

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
  },
}))

vi.mock('../hooks/useVersionCheck', () => ({
  useVersionCheck: () => ({ updateAvailable: false, serverVersion: null }),
}))

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockClient = await import('../api/client').then((m) => m.default) as any

function renderAppAt(path: string) {
  window.history.pushState({}, '', path)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  useAuthStore.getState().logout()
})

describe('비로그인 피드 접근', () => {
  it('토큰 없이 / 에 들어오면 로그인으로 보내지 않고 피드를 불러온다', async () => {
    // Arrange
    mockClient.get.mockResolvedValue({ data: { data: { posts: [], next_cursor: null } } })

    // Act
    renderAppAt('/')

    // Assert
    expect(await screen.findByText('아직 업로드된 영상이 없어요')).toBeInTheDocument()
    expect(mockClient.get).toHaveBeenCalledWith('/feed', { params: {} })
    expect(window.location.pathname).toBe('/')
  })

  it('로그인이 필요한 페이지는 여전히 로그인으로 보낸다', async () => {
    // Arrange
    mockClient.get.mockResolvedValue({ data: { data: {} } })

    // Act
    renderAppAt('/profile')

    // Assert
    await waitFor(() => expect(window.location.pathname).toBe('/login'))
  })
})
