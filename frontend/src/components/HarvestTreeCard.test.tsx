import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import HarvestTreeCard from './HarvestTreeCard'
import type { TreeStatus, HarvestMonthSummary, MonthlyHarvest } from '../api/types'

vi.mock('../api/client', () => ({
  default: { get: vi.fn() },
}))

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockClient = await import('../api/client').then((m) => m.default) as any

const tree: TreeStatus = { stage: 'tree', total_days: 40, next_stage_at: 100 }

const months: HarvestMonthSummary[] = [
  { month: '2026-07', my_oranges: 40, pool_oranges: 2016, share_pct: 2, round_count: 2 },
  { month: '2026-08', my_oranges: 120, pool_oranges: 2016, share_pct: 6, round_count: 2 },
  { month: '2026-09', my_oranges: 85, pool_oranges: 1008, share_pct: 8.4, round_count: 2 },
]

const harvests: Record<string, MonthlyHarvest> = {
  '2026-09': {
    month: '2026-09',
    rounds: [
      { id: 2, start_date: '2026-09-01', end_date: '2026-09-13', status: 'paid', oranges: 50, is_estimate: false },
      { id: 3, start_date: '2026-09-14', end_date: '2026-09-27', status: 'open', oranges: 35, is_estimate: true },
    ],
    my_oranges: 85, pool_oranges: 1008, share_pct: 8.4, fruit_count: 1, oranges_per_fruit: 100, has_estimate: true,
  },
  '2026-08': {
    month: '2026-08',
    rounds: [
      { id: 1, start_date: '2026-08-01', end_date: '2026-08-15', status: 'paid', oranges: 120, is_estimate: false },
    ],
    my_oranges: 120, pool_oranges: 2016, share_pct: 6, fruit_count: 2, oranges_per_fruit: 100, has_estimate: false,
  },
  '2026-07': {
    month: '2026-07', rounds: [], my_oranges: 0, pool_oranges: 0, share_pct: 0, fruit_count: 0, oranges_per_fruit: 100, has_estimate: false,
  },
}

function mockApi(opts: { monthsFail?: boolean; harvestFail?: boolean } = {}) {
  mockClient.get.mockImplementation((url: string, config?: { params?: { month?: string } }) => {
    if (url === '/users/me/harvest/months') {
      return opts.monthsFail ? Promise.reject(new Error('fail')) : Promise.resolve({ data: { data: months } })
    }
    if (url === '/users/me/harvest') {
      if (opts.harvestFail) return Promise.reject(new Error('fail'))
      return Promise.resolve({ data: { data: harvests[config?.params?.month ?? '2026-09'] } })
    }
    return Promise.reject(new Error(`unexpected ${url}`))
  })
}

function renderCard() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <HarvestTreeCard tree={tree} />
    </QueryClientProvider>,
  )
}

describe('HarvestTreeCard', () => {
  beforeEach(() => {
    // 현재 KST 월을 2026-09로 고정한다 (타이머는 Date만 가짜로 만든다)
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-09-29T03:00:00Z') })
    mockClient.get.mockReset()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('이번 달 합계, 점유율, 예상 표기를 보여준다', async () => {
    mockApi()
    renderCard()

    expect(await screen.findByText('이번 달 수확 (예상 포함)')).toBeInTheDocument()
    expect(screen.getByTestId('harvest-total')).toHaveTextContent('85개')
    expect(screen.getByText('이 달 전체 1,008개 중 8.4%')).toBeInTheDocument()
    expect(screen.getByText('2026년 9월')).toBeInTheDocument()
    expect(screen.getByText('9/1~9/13')).toBeInTheDocument()
    expect(screen.getByText('완료')).toBeInTheDocument()
    expect(screen.getByText('수확 중')).toBeInTheDocument()
  })

  it('예상 회차에만 "예상" 접두어가 붙는다', async () => {
    mockApi()
    renderCard()

    expect(await screen.findByText('예상 35개')).toBeInTheDocument()
    expect(screen.getByText('50개')).toBeInTheDocument()
  })

  it('월 이동 시 데이터가 바뀌고 양 끝에서 버튼이 비활성화된다', async () => {
    mockApi()
    const user = userEvent.setup()
    renderCard()

    await screen.findByText('이번 달 수확 (예상 포함)')
    expect(screen.getByRole('button', { name: '다음 달' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: '이전 달' }))
    expect(await screen.findByText('8월 수확')).toBeInTheDocument()
    expect(screen.getByTestId('harvest-total')).toHaveTextContent('120개')
    expect(screen.getByText('2026년 8월')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다음 달' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: '이전 달' }))
    expect(await screen.findByText('이 달은 아직 수확 회차가 없어요')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '이전 달' })).toBeDisabled()
  })

  it('월 스트립 클릭으로 해당 월이 선택된다', async () => {
    mockApi()
    const user = userEvent.setup()
    renderCard()

    await screen.findByText('이번 달 수확 (예상 포함)')
    const strip = screen.getByRole('group', { name: '월별 수확량' })
    const aug = within(strip).getByRole('button', { name: /8월/ })
    expect(aug).toHaveAttribute('aria-pressed', 'false')
    expect(within(strip).getByRole('button', { name: /9월/ })).toHaveAttribute('aria-pressed', 'true')

    await user.click(aug)
    await waitFor(() => expect(screen.getByTestId('harvest-total')).toHaveTextContent('120개'))
    expect(within(strip).getByRole('button', { name: /8월/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('월이 2개 미만이면 스트립을 숨긴다', async () => {
    mockClient.get.mockImplementation((url: string) =>
      url === '/users/me/harvest/months'
        ? Promise.resolve({ data: { data: [months[2]] } })
        : Promise.resolve({ data: { data: harvests['2026-09'] } }),
    )
    renderCard()

    await screen.findByText('이번 달 수확 (예상 포함)')
    expect(screen.queryByRole('group', { name: '월별 수확량' })).not.toBeInTheDocument()
  })

  it('조회 실패 시 오류 메시지를 보여주고 숫자는 보여주지 않는다', async () => {
    mockApi({ harvestFail: true })
    renderCard()

    expect(await screen.findByText('수확 정보를 불러오지 못했습니다')).toBeInTheDocument()
    expect(screen.queryByTestId('harvest-total')).not.toBeInTheDocument()
  })

  it('월 목록 조회가 실패해도 오류 메시지를 보여준다', async () => {
    mockApi({ monthsFail: true })
    renderCard()

    expect(await screen.findByText('수확 정보를 불러오지 못했습니다')).toBeInTheDocument()
  })

  it('나무 열매 기준(열매 1개 = 오렌지 100개)을 함께 보여준다', async () => {
    mockApi()
    renderCard()

    expect(await screen.findByText('열매 1개 = 오렌지 100개')).toBeInTheDocument()
  })

  it('월별 막대 아래에 그 달 지급 횟수를 보여준다', async () => {
    mockApi()
    renderCard()

    const strip = await screen.findByRole('group', { name: '월별 수확량' })
    expect(within(strip).getAllByText('2회')).toHaveLength(3)
  })

  it('도움말 버튼으로 오렌지를 얻는 방법을 펼치고 접는다', async () => {
    mockApi()
    const user = userEvent.setup()
    renderCard()

    const help = await screen.findByRole('button', { name: '오렌지를 얻는 방법' })
    expect(help).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText(/회차마다 오렌지 1,008개/)).not.toBeInTheDocument()

    await user.click(help)
    expect(help).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(/인증 1회 0.5점, 댓글 1개 0.01점/)).toBeInTheDocument()
    expect(screen.getByText(/회차마다 오렌지 1,008개/)).toBeInTheDocument()

    await user.click(help)
    expect(screen.queryByText(/회차마다 오렌지 1,008개/)).not.toBeInTheDocument()
  })

  it('예상이 포함된 달에만 예상값이 바뀔 수 있다는 안내를 보여준다', async () => {
    mockApi()
    const user = userEvent.setup()
    renderCard()

    expect(await screen.findByText('예상은 다른 참여자의 활동에 따라 달라질 수 있어요')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '이전 달' }))
    await screen.findByText('8월 수확')
    expect(screen.queryByText('예상은 다른 참여자의 활동에 따라 달라질 수 있어요')).not.toBeInTheDocument()
  })
})
