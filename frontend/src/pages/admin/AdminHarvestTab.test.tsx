import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import AdminHarvestTab from './AdminHarvestTab'

vi.mock('../../api/client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}))

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockClient = await import('../../api/client').then((m) => m.default) as any

function renderTab() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <AdminHarvestTab />
    </QueryClientProvider>,
  )
}

const openRound = {
  id: 1, start_date: '2026-09-01', end_date: '2026-09-13', status: 'open',
  total_oranges: 1008, seed: 7, paid_at: null, participant_count: 2,
}
const paidRound = {
  id: 2, start_date: '2026-09-14', end_date: '2026-09-30', status: 'paid',
  total_oranges: 1008, seed: 8, paid_at: '2026-10-01T03:00:00Z', participant_count: 2,
}
const openDetail = {
  round: openRound,
  is_estimate: true,
  rows: [
    { user_id: 1, username: 'alice', uploads: 3, comments: 10, score: 1.6, probability_pct: 80, expected_oranges: 806.4 },
    { user_id: 2, username: 'bob', uploads: 1, comments: 0, score: 0.5, probability_pct: 20, expected_oranges: 201.6 },
  ],
}
const paidDetail = {
  round: paidRound,
  is_estimate: false,
  rows: [
    { user_id: 1, username: 'alice', uploads: 3, comments: 10, score: 1.6, oranges: 800 },
    { user_id: 2, username: 'bob', uploads: 1, comments: 0, score: 0.5, oranges: 208 },
  ],
}

function mockGets(rounds = [openRound, paidRound], detail: unknown = openDetail) {
  mockClient.get.mockImplementation(async (url: string) => {
    if (url === '/admin/harvest/rounds') return { data: { data: rounds } }
    return { data: { data: detail } }
  })
}

function axiosError(status: number, message: string) {
  return Object.assign(new Error('Request failed'), {
    isAxiosError: true,
    response: { status, data: { detail: { code: 'HARVEST_ERROR', message } } },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGets()
})

describe('AdminHarvestTab 회차 목록', () => {
  it('선택한 월의 회차 목록을 범위와 상태로 보여준다', async () => {
    renderTab()
    expect(await screen.findByText('9/1~9/13')).toBeInTheDocument()
    expect(screen.getByText('9/14~9/30')).toBeInTheDocument()
    expect(screen.getByText('진행 중')).toBeInTheDocument()
    expect(screen.getByText(/지급 완료/, { selector: 'span' })).toBeInTheDocument()
    const call = mockClient.get.mock.calls.find((c: unknown[]) => c[0] === '/admin/harvest/rounds')
    expect(call[1].params.month).toMatch(/^\d{4}-\d{2}$/)
  })

  it('월을 바꾸면 해당 월로 다시 조회한다', async () => {
    const user = userEvent.setup()
    renderTab()
    await screen.findByText('9/1~9/13')
    const input = screen.getByLabelText('조회 월')
    await user.clear(input)
    await user.type(input, '2026-08')
    const months = mockClient.get.mock.calls.map((c: unknown[]) => (c[1] as { params?: { month: string } })?.params?.month)
    expect(months).toContain('2026-08')
  })
})

describe('AdminHarvestTab 회차 생성', () => {
  it('회차 만들기는 선택한 월과 주기로 generate를 호출하고 성공 메시지를 보여준다', async () => {
    const user = userEvent.setup()
    mockClient.post.mockResolvedValueOnce({ data: { data: [openRound, paidRound] } })
    renderTab()
    await screen.findByText('9/1~9/13')

    await user.selectOptions(screen.getByLabelText('주기'), 'biweekly')
    await user.click(screen.getByRole('button', { name: '회차 만들기' }))

    const [url, body] = mockClient.post.mock.calls[0]
    expect(url).toBe('/admin/harvest/rounds/generate')
    expect(body.cadence).toBe('biweekly')
    expect(Number.isInteger(body.year)).toBe(true)
    expect(Number.isInteger(body.month)).toBe(true)
    expect(await screen.findByText('회차 2개를 만들었습니다')).toBeInTheDocument()
  })

  it('겹치는 회차가 있으면 서버의 409 메시지를 보여준다', async () => {
    const user = userEvent.setup()
    mockClient.post.mockRejectedValueOnce(axiosError(409, '이미 겹치는 회차가 있습니다'))
    renderTab()
    await screen.findByText('9/1~9/13')

    await user.click(screen.getByRole('button', { name: '회차 만들기' }))
    expect(await screen.findByText(/이미 겹치는 회차가 있습니다/)).toBeInTheDocument()
  })

  it('수동 생성은 시작일과 종료일을 보낸다', async () => {
    const user = userEvent.setup()
    mockClient.post.mockResolvedValueOnce({ data: { data: openRound } })
    renderTab()
    await screen.findByText('9/1~9/13')

    await user.type(screen.getByLabelText('시작일'), '2026-09-01')
    await user.type(screen.getByLabelText('종료일'), '2026-09-13')
    await user.click(screen.getByRole('button', { name: '수동 생성' }))

    expect(mockClient.post).toHaveBeenCalledWith('/admin/harvest/rounds', { start_date: '2026-09-01', end_date: '2026-09-13' })
    expect(await screen.findByText('회차를 만들었습니다')).toBeInTheDocument()
  })
})

describe('AdminHarvestTab 회차 상세', () => {
  it('회차를 선택하면 예상 분배 표를 보여준다', async () => {
    const user = userEvent.setup()
    renderTab()
    await user.click(await screen.findByRole('button', { name: /9\/1~9\/13/ }))

    expect(await screen.findByText('alice')).toBeInTheDocument()
    expect(screen.getByText('bob')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: '예상 오렌지' })).toBeInTheDocument()
    expect(screen.getByText('80%')).toBeInTheDocument()
    expect(screen.queryByText(/sats/i)).not.toBeInTheDocument()
  })

  it('지급 완료 회차는 오렌지 확정 값과 합계를 보여준다', async () => {
    const user = userEvent.setup()
    mockGets([openRound, paidRound], paidDetail)
    renderTab()
    await user.click(await screen.findByRole('button', { name: /9\/14~9\/30/ }))

    expect(await screen.findByRole('columnheader', { name: '오렌지' })).toBeInTheDocument()
    const totalRow = screen.getByText('합계').closest('tr') as HTMLElement
    expect(within(totalRow).getByText('1,008')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '지급 완료' })).not.toBeInTheDocument()
  })

  it('지급 완료는 확인 단계를 거친 뒤에만 POST 하고 성공 메시지를 보여준다', async () => {
    const user = userEvent.setup()
    mockClient.post.mockResolvedValueOnce({ data: { data: { ...openRound, status: 'paid' } } })
    renderTab()
    await user.click(await screen.findByRole('button', { name: /9\/1~9\/13/ }))
    await screen.findByText('alice')

    await user.click(screen.getByRole('button', { name: '지급 완료' }))
    expect(screen.getByText(/되돌리려면 회차를 삭제해야 합니다/)).toBeInTheDocument()
    expect(mockClient.post).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '확인' }))
    expect(mockClient.post).toHaveBeenCalledWith('/admin/harvest/rounds/1/pay')
    expect(await screen.findByText('지급 완료로 표시했습니다')).toBeInTheDocument()
  })

  it('확인 단계에서 취소하면 POST 하지 않는다', async () => {
    const user = userEvent.setup()
    renderTab()
    await user.click(await screen.findByRole('button', { name: /9\/1~9\/13/ }))
    await screen.findByText('alice')

    await user.click(screen.getByRole('button', { name: '지급 완료' }))
    await user.click(screen.getByRole('button', { name: '취소' }))
    expect(mockClient.post).not.toHaveBeenCalled()
    expect(screen.queryByText(/되돌리려면 회차를 삭제해야 합니다/)).not.toBeInTheDocument()
  })

  it('지급 실패 시 서버 메시지를 보여준다', async () => {
    const user = userEvent.setup()
    mockClient.post.mockRejectedValueOnce(axiosError(409, '이미 지급 완료된 회차입니다'))
    renderTab()
    await user.click(await screen.findByRole('button', { name: /9\/1~9\/13/ }))
    await screen.findByText('alice')

    await user.click(screen.getByRole('button', { name: '지급 완료' }))
    await user.click(screen.getByRole('button', { name: '확인' }))
    expect(await screen.findByText(/이미 지급 완료된 회차입니다/)).toBeInTheDocument()
  })

  it('삭제는 확인 단계를 거친 뒤 DELETE 하고 성공 메시지를 보여준다', async () => {
    const user = userEvent.setup()
    mockClient.delete.mockResolvedValueOnce({ data: {} })
    renderTab()
    await user.click(await screen.findByRole('button', { name: /9\/1~9\/13/ }))
    await screen.findByText('alice')

    await user.click(screen.getByRole('button', { name: '회차 삭제' }))
    expect(mockClient.delete).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '확인' }))

    expect(mockClient.delete).toHaveBeenCalledWith('/admin/harvest/rounds/1')
    expect(await screen.findByText('회차를 삭제했습니다')).toBeInTheDocument()
  })
})
