import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import AdminHarvestTab from './AdminHarvestTab'

vi.mock('../../api/client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
    put: vi.fn(),
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
  total_oranges: 1008, seed: 7, paid_at: null, btc_paid_at: null, participant_count: 2,
}
const paidRound = {
  id: 2, start_date: '2026-09-14', end_date: '2026-09-30', status: 'paid',
  total_oranges: 1008, seed: 8, paid_at: '2026-10-01T03:00:00Z', btc_paid_at: '2026-10-01T03:00:00Z', participant_count: 2,
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

const userStatus = {
  month: '2026-09',
  pool_oranges: 66,
  rows: [
    { user_id: 1, username: 'alice', growing: 10, ripe: 20, collected: 30, total: 60, share_pct: 90.9 },
    { user_id: 2, username: 'bob', growing: 1, ripe: 2, collected: 3, total: 6, share_pct: 9.1 },
  ],
}

function mockGets(rounds = [openRound, paidRound], detail: unknown = openDetail, collectEnabled = false, users: unknown = userStatus) {
  mockClient.get.mockImplementation(async (url: string) => {
    if (url === '/admin/harvest/rounds') return { data: { data: rounds } }
    if (url === '/admin/harvest/settings') return { data: { data: { collect_enabled: collectEnabled } } }
    if (url === '/admin/harvest/users') return { data: { data: users } }
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
  // 오늘(KST)을 2026-09-29로 고정한다 (타이머는 Date만 가짜로 만든다)
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-09-29T03:00:00Z') })
  vi.clearAllMocks()
  mockGets()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('AdminHarvestTab 회차 목록', () => {
  it('선택한 월의 회차 목록을 범위와 상태로 보여준다', async () => {
    renderTab()
    expect(await screen.findByText('9/1~9/13')).toBeInTheDocument()
    expect(screen.getByText('9/14~9/30')).toBeInTheDocument()
    expect(screen.getByText('진행 중')).toBeInTheDocument()
    expect(screen.getByText('확정')).toBeInTheDocument()
    const call = mockClient.get.mock.calls.find((c: unknown[]) => c[0] === '/admin/harvest/rounds')
    expect(call[1].params.month).toMatch(/^\d{4}-\d{2}$/)
  })

  it('비율은 항상 소수 한 자리로 표시하고 합계는 풀 대비로 계산한다', async () => {
    mockGets([openRound, paidRound], openDetail, false, {
      month: '2026-09',
      pool_oranges: 100,
      rows: [
        { user_id: 1, username: 'alice', growing: 10, ripe: 5, collected: 5, total: 20, share_pct: 20 },
        { user_id: 2, username: 'bob', growing: 40, ripe: 20, collected: 20, total: 80, share_pct: 80 },
      ],
    })
    renderTab()
    const heading = await screen.findByText('사용자별 오렌지 현황')
    const card = heading.parentElement as HTMLElement
    const aliceRow = (await within(card).findByText('alice', { selector: 'td' })).closest('tr') as HTMLElement
    expect(within(aliceRow).getAllByRole('cell').map((c) => c.textContent)).toContain('20.0%')
    const totalRow = within(card).getByText('합계', { selector: 'td' }).closest('tr') as HTMLElement
    expect(within(totalRow).getAllByRole('cell').map((c) => c.textContent).pop()).toBe('100.0%')
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

describe('AdminHarvestTab 비트코인 지급 표시', () => {
  it('btc_paid_at 이 있으면 지급 완료 날짜를, 없으면 표시 버튼을 보여준다', async () => {
    renderTab()
    await screen.findByText('9/1~9/13')
    expect(screen.getByText('비트코인 지급 완료 (10/1)')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: '비트코인 지급 완료 표시' })).toHaveLength(1)
    expect(screen.getByRole('button', { name: '비트코인 지급 완료 표시' })).toBeEnabled()
  })
})

describe('AdminHarvestTab 수확 버튼 스위치', () => {
  let confirmSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
  })
  afterEach(() => {
    confirmSpy.mockRestore()
  })

  it('꺼짐 상태를 API 에서 읽어 보여준다', async () => {
    renderTab()
    const toggle = await screen.findByRole('switch', { name: '사용자 수확 버튼' })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    expect(await screen.findByText(/꺼짐: 주가 끝나면 오렌지가 자동으로 수확됩니다/)).toBeInTheDocument()
  })

  it('켜짐 상태를 API 에서 읽어 보여준다', async () => {
    mockGets([openRound, paidRound], openDetail, true)
    renderTab()
    const toggle = await screen.findByRole('switch', { name: '사용자 수확 버튼' })
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'))
    expect(screen.getByText(/켜짐: 사용자가 직접 수확 버튼을 눌러 거둡니다/)).toBeInTheDocument()
  })

  it('켜면 확인 후 PUT 하고 성공 메시지를 보여준다', async () => {
    const user = userEvent.setup()
    mockClient.put.mockResolvedValueOnce({ data: { data: { collect_enabled: true } } })
    renderTab()
    const toggle = await screen.findByRole('switch', { name: '사용자 수확 버튼' })
    await waitFor(() => expect(toggle).toBeEnabled())
    await user.click(toggle)

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('수확 버튼을 켭니다'))
    expect(mockClient.put).toHaveBeenCalledWith('/admin/harvest/settings', { collect_enabled: true })
    expect(await screen.findByText('수확 버튼을 켰습니다')).toBeInTheDocument()
    expect(toggle).toHaveAttribute('aria-checked', 'true')
  })

  it('끌 때는 대기 중인 오렌지가 자동 수확된다는 안내를 확인받는다', async () => {
    const user = userEvent.setup()
    mockGets([openRound, paidRound], openDetail, true)
    mockClient.put.mockResolvedValueOnce({ data: { data: { collect_enabled: false } } })
    renderTab()
    const toggle = await screen.findByRole('switch', { name: '사용자 수확 버튼' })
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'))
    await user.click(toggle)

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('자동으로 수확됩니다'))
    expect(mockClient.put).toHaveBeenCalledWith('/admin/harvest/settings', { collect_enabled: false })
    expect(await screen.findByText('수확 버튼을 껐습니다')).toBeInTheDocument()
  })

  it('확인을 취소하면 PUT 하지 않는다', async () => {
    const user = userEvent.setup()
    confirmSpy.mockReturnValue(false)
    renderTab()
    const toggle = await screen.findByRole('switch', { name: '사용자 수확 버튼' })
    await waitFor(() => expect(toggle).toBeEnabled())
    await user.click(toggle)
    expect(mockClient.put).not.toHaveBeenCalled()
  })

  it('저장에 실패하면 서버 메시지를 보여준다', async () => {
    const user = userEvent.setup()
    mockClient.put.mockRejectedValueOnce(axiosError(500, '설정을 저장하지 못했습니다'))
    renderTab()
    const toggle = await screen.findByRole('switch', { name: '사용자 수확 버튼' })
    await waitFor(() => expect(toggle).toBeEnabled())
    await user.click(toggle)
    expect(await screen.findByText(/설정을 저장하지 못했습니다/)).toBeInTheDocument()
    expect(toggle).toHaveAttribute('aria-checked', 'false')
  })
})

describe('AdminHarvestTab 사용자별 오렌지 현황', () => {
  it('행과 합계 행을 보여준다', async () => {
    renderTab()
    const heading = await screen.findByText('사용자별 오렌지 현황')
    const card = heading.parentElement as HTMLElement
    expect(await within(card).findByRole('table')).toBeInTheDocument()
    expect(within(card).getByRole('columnheader', { name: '자라는 중' })).toBeInTheDocument()
    expect(within(card).getByRole('columnheader', { name: '수확 대기' })).toBeInTheDocument()
    expect(within(card).getByRole('columnheader', { name: '수확함' })).toBeInTheDocument()
    const totalRow = within(card).getByText('합계', { selector: 'td' }).closest('tr') as HTMLElement
    expect(within(totalRow).getAllByRole('cell').map((c) => c.textContent)).toEqual(['합계', '11', '22', '33', '66', '100.0%'])
    expect(within(card).getByRole('columnheader', { name: '비율' })).toBeInTheDocument()
    const aliceRow = within(card).getByText('alice', { selector: 'td' }).closest('tr') as HTMLElement
    expect(within(aliceRow).getAllByRole('cell').map((c) => c.textContent)).toEqual(['alice', '10', '20', '30', '60', '90.9%'])
    const call = mockClient.get.mock.calls.find((c: unknown[]) => c[0] === '/admin/harvest/users')
    expect(call[1].params.month).toMatch(/^\d{4}-\d{2}$/)
  })

  it('모바일 목록에 사용자별 합계와 비율, 합계 항목을 보여준다', async () => {
    renderTab()
    const list = await screen.findByTestId('harvest-user-list')
    const items = within(list).getAllByRole('listitem').map((li) => li.textContent)
    expect(items).toEqual([
      'alice60개 · 90.9%자라는 중 10수확 대기 20수확함 30',
      'bob6개 · 9.1%자라는 중 1수확 대기 2수확함 3',
      '합계66개 · 100.0%자라는 중 11수확 대기 22수확함 33',
    ])
  })

  it('행이 없으면 안내 문구를 보여준다', async () => {
    mockGets([openRound, paidRound], openDetail, false, { month: '2026-09', rows: [] })
    renderTab()
    expect(await screen.findByText('이 달에는 오렌지 현황이 없습니다')).toBeInTheDocument()
  })
})

describe('AdminHarvestTab 회차 상세', () => {
  it('회차를 선택하면 예상 분배 표를 보여준다', async () => {
    const user = userEvent.setup()
    renderTab()
    await user.click(await screen.findByRole('button', { name: /9\/1~9\/13/ }))

    const scoreHeader = await screen.findByRole('columnheader', { name: '점수' })
    expect(within(scoreHeader.closest('table') as HTMLElement).getByText('bob')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: '예상 오렌지' })).toBeInTheDocument()
    expect(screen.getByText('80%')).toBeInTheDocument()
    expect(screen.queryByText(/sats/i)).not.toBeInTheDocument()
  })

  it('확정 회차는 오렌지 확정 값과 합계를 보여준다', async () => {
    const user = userEvent.setup()
    mockGets([openRound, paidRound], paidDetail)
    renderTab()
    await user.click(await screen.findByRole('button', { name: /9\/14~9\/30/ }))

    expect(await screen.findByRole('columnheader', { name: '오렌지' })).toBeInTheDocument()
    const totalRow = within(screen.getByRole('columnheader', { name: '점수' }).closest('table') as HTMLElement).getByText('합계').closest('tr') as HTMLElement
    expect(within(totalRow).getByText('1,008')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: '비트코인 지급 완료 표시' })).toHaveLength(1)
  })

  it('비트코인 지급 표시는 확인 단계를 거친 뒤에만 POST 하고 성공 메시지를 보여준다', async () => {
    const user = userEvent.setup()
    mockClient.post.mockResolvedValueOnce({ data: { data: { ...openRound, status: 'paid', btc_paid_at: '2026-09-29T03:00:00Z' } } })
    renderTab()
    await screen.findByText('9/1~9/13')

    await user.click(screen.getByRole('button', { name: '비트코인 지급 완료 표시' }))
    expect(await screen.findByText(/표시한 뒤에는 되돌릴 수 없습니다/)).toBeInTheDocument()
    expect(mockClient.post).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '확인' }))
    expect(mockClient.post).toHaveBeenCalledWith('/admin/harvest/rounds/1/pay')
    expect(await screen.findByText('비트코인 지급 완료로 표시했습니다')).toBeInTheDocument()
  })

  it('확인 단계에서 취소하면 POST 하지 않는다', async () => {
    const user = userEvent.setup()
    renderTab()
    await screen.findByText('9/1~9/13')

    await user.click(screen.getByRole('button', { name: '비트코인 지급 완료 표시' }))
    await user.click(await screen.findByRole('button', { name: '취소' }))
    expect(mockClient.post).not.toHaveBeenCalled()
    expect(screen.queryByText(/표시한 뒤에는 되돌릴 수 없습니다/)).not.toBeInTheDocument()
  })

  it('지급 표시 실패 시 서버 메시지를 보여준다', async () => {
    const user = userEvent.setup()
    mockClient.post.mockRejectedValueOnce(axiosError(409, '이미 비트코인 지급 완료된 회차입니다'))
    renderTab()
    await screen.findByText('9/1~9/13')

    await user.click(screen.getByRole('button', { name: '비트코인 지급 완료 표시' }))
    await user.click(await screen.findByRole('button', { name: '확인' }))
    expect(await screen.findByText(/이미 비트코인 지급 완료된 회차입니다/)).toBeInTheDocument()
  })

  it('삭제는 확인 단계를 거친 뒤 DELETE 하고 성공 메시지를 보여준다', async () => {
    const user = userEvent.setup()
    mockClient.delete.mockResolvedValueOnce({ data: {} })
    renderTab()
    await user.click(await screen.findByRole('button', { name: /9\/1~9\/13/ }))
    await screen.findByRole('columnheader', { name: '점수' })

    await user.click(screen.getByRole('button', { name: '회차 삭제' }))
    expect(mockClient.delete).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '확인' }))

    expect(mockClient.delete).toHaveBeenCalledWith('/admin/harvest/rounds/1')
    expect(await screen.findByText('회차를 삭제했습니다')).toBeInTheDocument()
  })

  it('기간이 끝나지 않은 회차는 비트코인 지급 표시 버튼을 비활성화하고 사유를 안내한다', async () => {
    const ongoing = { ...openRound, id: 3, start_date: '2026-09-28', end_date: '2026-09-29' }
    mockGets([ongoing], { ...openDetail, round: ongoing })
    renderTab()
    await screen.findByText('9/28~9/29')

    const button = screen.getByRole('button', { name: '비트코인 지급 완료 표시' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('title', '기간이 끝난 다음 날부터 비트코인 지급 완료로 표시할 수 있어요 (9/30 이후)')
  })

  it('종료일 다음 날이 되면 비트코인 지급 표시 버튼이 활성화된다', async () => {
    renderTab()
    await screen.findByText('9/1~9/13')
    expect(screen.getByRole('button', { name: '비트코인 지급 완료 표시' })).toBeEnabled()
  })

  it('확정 회차 삭제는 강한 경고를 보여주고 force=true 로 삭제한다', async () => {
    const user = userEvent.setup()
    mockClient.delete.mockResolvedValueOnce({ data: {} })
    mockGets([openRound, paidRound], paidDetail)
    renderTab()
    await user.click(await screen.findByRole('button', { name: /9\/14~9\/30/ }))
    await screen.findByRole('columnheader', { name: '점수' })

    await user.click(screen.getByRole('button', { name: '회차 삭제' }))
    expect(screen.getByText('확정된 기록입니다. 삭제하면 이 회차의 오렌지 배분 기록이 사라집니다.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '확인' }))

    expect(mockClient.delete).toHaveBeenCalledWith('/admin/harvest/rounds/2', { params: { force: true } })
    expect(await screen.findByText('회차를 삭제했습니다')).toBeInTheDocument()
  })

  it('진행 중 회차 삭제에는 강한 경고와 force 가 없다', async () => {
    const user = userEvent.setup()
    mockClient.delete.mockResolvedValueOnce({ data: {} })
    renderTab()
    await user.click(await screen.findByRole('button', { name: /9\/1~9\/13/ }))
    await screen.findByRole('columnheader', { name: '점수' })

    await user.click(screen.getByRole('button', { name: '회차 삭제' }))
    expect(screen.queryByText(/오렌지 배분 기록이 사라집니다/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '확인' }))
    expect(mockClient.delete).toHaveBeenCalledWith('/admin/harvest/rounds/1')
  })

  it('비트코인 지급 결과 메시지는 상세 패널 안(확인 영역 근처)에 보인다', async () => {
    const user = userEvent.setup()
    mockClient.post.mockRejectedValueOnce(axiosError(409, '아직 기간이 끝나지 않았습니다'))
    renderTab()
    await screen.findByText('9/1~9/13')

    await user.click(screen.getByRole('button', { name: '비트코인 지급 완료 표시' }))
    await user.click(await screen.findByRole('button', { name: '확인' }))
    const alert = await screen.findByText(/아직 기간이 끝나지 않았습니다/)
    const panel = screen.getByRole('button', { name: '회차 삭제' }).closest('div.space-y-3') as HTMLElement
    expect(panel).toContainElement(alert)
  })
})
