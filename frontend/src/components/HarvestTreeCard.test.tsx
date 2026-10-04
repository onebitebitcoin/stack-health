import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import HarvestTreeCard from './HarvestTreeCard'
import type { MyHarvest } from '../api/types'

vi.mock('../api/client', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}))

const { toastSuccess, toastError } = vi.hoisted(() => ({ toastSuccess: vi.fn(), toastError: vi.fn() }))
vi.mock('react-hot-toast', () => ({
  default: { success: toastSuccess, error: toastError },
}))

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockClient = await import('../api/client').then((m) => m.default) as any

const base: MyHarvest = {
  total_collected: 1316,
  this_week: { start_date: '2026-09-28', end_date: '2026-10-04', oranges: 336, fruit_count: 4, share_pct: 33.3 },
  ripe_oranges: 0,
  collect_enabled: false,
  oranges_per_fruit: 100,
}

function mockHarvest(overrides: Partial<MyHarvest> = {}) {
  mockClient.get.mockResolvedValue({ data: { data: { ...base, ...overrides } } })
}

function renderCard() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <HarvestTreeCard />
    </QueryClientProvider>,
  )
}

function fruitCount(container: HTMLElement): number {
  return container.querySelectorAll('circle[fill="rgb(var(--accent-rgb))"]').length
}

describe('HarvestTreeCard', () => {
  beforeEach(() => {
    mockClient.get.mockReset()
    mockClient.post.mockReset()
    toastSuccess.mockReset()
    toastError.mockReset()
  })

  it('지금까지 모은 오렌지와 이번 주 자라는 오렌지를 보여준다', async () => {
    mockHarvest()
    renderCard()
    expect(await screen.findByTestId('harvest-total')).toHaveTextContent('1316개')
    expect(screen.getByText('지금까지 모은 오렌지')).toBeInTheDocument()
    expect(screen.getByTestId('harvest-this-week')).toHaveTextContent('이번 주 자라는 중 336개')
    expect(screen.getByTestId('harvest-share')).toHaveTextContent('내 몫 33.3%')
  })

  it('이번 주 오렌지가 0이면 내 몫을 숨긴다', async () => {
    mockHarvest({ this_week: { ...base.this_week, oranges: 0, fruit_count: 0, share_pct: 0 } })
    renderCard()
    await screen.findByTestId('harvest-this-week-empty')
    expect(screen.queryByTestId('harvest-share')).not.toBeInTheDocument()
    expect(screen.queryByText(/내 몫/)).not.toBeInTheDocument()
  })

  it('나무 열매는 이번 주 오렌지 기준이다', async () => {
    mockHarvest()
    const { container } = renderCard()
    await screen.findByTestId('harvest-total')
    expect(fruitCount(container)).toBe(4)
  })

  it('이번 주 오렌지가 없으면 안내 문구를 보여주고 열매가 없다', async () => {
    mockHarvest({ this_week: { ...base.this_week, oranges: 0, fruit_count: 0 } })
    const { container } = renderCard()
    expect(await screen.findByTestId('harvest-this-week-empty')).toHaveTextContent('영상을 올리면 오렌지가 자라요')
    expect(fruitCount(container)).toBe(0)
  })

  it('월별 비교 막대는 없다', async () => {
    mockHarvest()
    renderCard()
    await screen.findByTestId('harvest-total')
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
    expect(mockClient.get).toHaveBeenCalledTimes(1)
    expect(mockClient.get).toHaveBeenCalledWith('/users/me/harvest')
  })

  it('스위치가 꺼져 있으면 수확 대기분이 있어도 버튼이 없다', async () => {
    mockHarvest({ collect_enabled: false, ripe_oranges: 490 })
    renderCard()
    await screen.findByTestId('harvest-total')
    expect(screen.queryByRole('button', { name: /수확하기/ })).not.toBeInTheDocument()
  })

  it('스위치가 켜져 있어도 수확 대기분이 없으면 버튼이 없다', async () => {
    mockHarvest({ collect_enabled: true, ripe_oranges: 0 })
    renderCard()
    await screen.findByTestId('harvest-total')
    expect(screen.queryByRole('button', { name: /수확하기/ })).not.toBeInTheDocument()
  })

  it('수확 버튼을 누르면 수확하고 성공 메시지를 띄운 뒤 다시 불러온다', async () => {
    mockHarvest({ collect_enabled: true, ripe_oranges: 490 })
    mockClient.post.mockResolvedValue({ data: { data: { collected: 490 } } })
    renderCard()
    const button = await screen.findByRole('button', { name: '오렌지 490개 수확하기' })

    mockHarvest({ collect_enabled: true, ripe_oranges: 0, total_collected: 1806 })
    await userEvent.click(button)

    expect(mockClient.post).toHaveBeenCalledWith('/users/me/harvest/collect')
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('오렌지 490개를 수확했어요'))
    await waitFor(() => expect(screen.getByTestId('harvest-total')).toHaveTextContent('1806개'))
    expect(screen.queryByRole('button', { name: /수확하기/ })).not.toBeInTheDocument()
  })

  it('수확에 실패하면 실패 메시지를 띄운다', async () => {
    mockHarvest({ collect_enabled: true, ripe_oranges: 490 })
    mockClient.post.mockRejectedValue(new Error('network'))
    renderCard()
    await userEvent.click(await screen.findByRole('button', { name: '오렌지 490개 수확하기' }))
    await waitFor(() => expect(toastError).toHaveBeenCalled())
    expect(toastSuccess).not.toHaveBeenCalled()
  })

  it('불러오기에 실패하면 오류 문구를 보여준다', async () => {
    mockClient.get.mockRejectedValue(new Error('network'))
    renderCard()
    expect(await screen.findByRole('alert')).toHaveTextContent('수확 정보를 불러오지 못했습니다')
  })

  it('도움말에 열매 기준을 보여준다', async () => {
    mockHarvest()
    renderCard()
    await screen.findByTestId('harvest-total')
    await userEvent.click(screen.getByRole('button', { name: '오렌지를 얻는 방법' }))
    expect(screen.getByText('열매 1개 = 이번 주 오렌지 100개')).toBeInTheDocument()
  })
})
