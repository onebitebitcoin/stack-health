import { render, screen, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import ProfilePage from '../pages/ProfilePage'
import { useAuthStore } from '../store/auth'

vi.mock('../api/client', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}))

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockClient = await import('../api/client').then((m) => m.default) as any

function post(id: number) {
  return { id, cdn_url: `https://cdn.test/${id}.mp4`, thumbnail_url: `https://cdn.test/${id}.jpg`, like_count: 0, view_count: 0, caption: null }
}

function dateStr(day: number) {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

beforeEach(() => {
  vi.clearAllMocks()
  useAuthStore.getState().login('token-abc', {
    id: 1, email: 'me@x.com', username: 'me', lightning_address: null,
    avatar_url: null, is_admin: false, app_settings: {},
  })
  mockClient.get.mockImplementation((url: string) => {
    if (url === '/history') {
      const now = new Date()
      return Promise.resolve({
        data: {
          data: {
            year: now.getFullYear(),
            month: now.getMonth() + 1,
            streak: 0,
            total_days: 2,
            workout_days: { [dateStr(1)]: [post(1), post(2), post(3)], [dateStr(2)]: [post(4)] },
          },
        },
      })
    }
    return Promise.reject(new Error('unmocked'))
  })
})

describe('ProfilePage 달력 영상 개수 배지', () => {
  it('영상이 2개 이상인 날에만 개수 배지를 보여준다', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter><ProfilePage /></MemoryRouter>
      </QueryClientProvider>,
    )

    const multi = await screen.findByLabelText('1일, 영상 3개')
    expect(within(multi).getByTestId('calendar-count-badge')).toHaveTextContent('3')

    expect(screen.getAllByTestId('calendar-count-badge')).toHaveLength(1)
    expect(screen.queryByLabelText(/^2일, 영상/)).not.toBeInTheDocument()
  })
})
