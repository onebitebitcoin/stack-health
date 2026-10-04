import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import AdminPage from './AdminPage'

vi.mock('../api/client', () => ({
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}))
vi.mock('../store/auth', () => ({
  useAuthStore: (sel: (s: unknown) => unknown) => sel({ user: { is_admin: true, username: 'admin' } }),
}))
vi.mock('./admin/AdminPayoutTab', () => ({ default: () => <div>payout-content</div> }))
vi.mock('./admin/AdminHarvestTab', () => ({ default: () => <div>harvest-content</div> }))

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockClient = await import('../api/client').then((m) => m.default) as any

beforeEach(() => {
  vi.clearAllMocks()
  mockClient.get.mockResolvedValue({ data: { data: {} } })
})

describe('AdminPage tabs', () => {
  it('탭을 누르면 내용이 바뀌고 선택 상태가 갱신된다', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/admin?tab=harvest']}>
          <AdminPage />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(5)
    expect(tabs[4]).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('harvest-content')).toBeInTheDocument()

    await userEvent.click(tabs[3])
    expect(screen.getByText('payout-content')).toBeInTheDocument()
    expect(screen.getAllByRole('tab')[3]).toHaveAttribute('aria-selected', 'true')
    expect(screen.getAllByRole('tab')[4]).toHaveAttribute('aria-selected', 'false')
  })
})
