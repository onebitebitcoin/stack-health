import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import AdminPayoutTab from './AdminPayoutTab'

vi.mock('../../api/client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
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
      <AdminPayoutTab />
    </QueryClientProvider>,
  )
}

const configuredStatus = {
  configured: true,
  wallet_id: 'wallet-1',
  balance_sats: 50000,
  max_test_sats: 1000,
  error: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockClient.get.mockResolvedValue({ data: { data: configuredStatus } })
})

describe('AdminPayoutTab 연결 상태', () => {
  it('BLINK_API_KEY 미설정이면 안내 문구를 보여주고 폼을 비활성화한다', async () => {
    mockClient.get.mockResolvedValueOnce({
      data: { data: { configured: false, wallet_id: null, balance_sats: null, max_test_sats: 1000, error: null } },
    })
    renderTab()

    expect(await screen.findByText('BLINK_API_KEY 미설정 — 비트코인 지급 테스트를 사용할 수 없습니다')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('you@wallet.com')).toBeDisabled()
    expect(screen.getByRole('button', { name: '전송' })).toBeDisabled()
  })

  it('연결이 정상이면 지갑 잔액을 보여준다', async () => {
    renderTab()
    expect(await screen.findByText('지갑 잔액 50,000 sats')).toBeInTheDocument()
  })

  it('설정은 되었지만 오류가 있으면 서버 메시지를 그대로 노출한다', async () => {
    mockClient.get.mockResolvedValueOnce({
      data: { data: { configured: true, wallet_id: null, balance_sats: null, max_test_sats: 1000, error: '잔액 조회에 실패했습니다' } },
    })
    renderTab()
    expect(await screen.findByText('Blink 연결 오류: 잔액 조회에 실패했습니다')).toBeInTheDocument()
  })
})

describe('AdminPayoutTab 입력 검증', () => {
  it('올바르지 않은 라이트닝 주소를 입력하면 에러를 보여주고 API를 호출하지 않는다', async () => {
    const user = userEvent.setup()
    renderTab()
    await screen.findByText('지갑 잔액 50,000 sats')

    await user.type(screen.getByPlaceholderText('you@wallet.com'), 'invalid-address')
    await user.type(screen.getByPlaceholderText('예: 100'), '100')
    await user.click(screen.getByRole('button', { name: '전송' }))

    expect(await screen.findByText('올바른 라이트닝 주소 형식이 아닙니다 (예: user@domain.com)')).toBeInTheDocument()
    expect(mockClient.post).not.toHaveBeenCalled()
  })

  it('최대 sats를 초과하면 에러를 보여주고 API를 호출하지 않는다', async () => {
    const user = userEvent.setup()
    renderTab()
    await screen.findByText('지갑 잔액 50,000 sats')

    await user.type(screen.getByPlaceholderText('you@wallet.com'), 'user@example.com')
    await user.type(screen.getByPlaceholderText('예: 100'), '5000')
    await user.click(screen.getByRole('button', { name: '전송' }))

    expect(await screen.findByText('최대 1,000 sats까지 보낼 수 있습니다')).toBeInTheDocument()
    expect(mockClient.post).not.toHaveBeenCalled()
  })

  it('금액이 0 이하이면 에러를 보여주고 API를 호출하지 않는다', async () => {
    const user = userEvent.setup()
    renderTab()
    await screen.findByText('지갑 잔액 50,000 sats')

    await user.type(screen.getByPlaceholderText('you@wallet.com'), 'user@example.com')
    await user.type(screen.getByPlaceholderText('예: 100'), '0')
    await user.click(screen.getByRole('button', { name: '전송' }))

    expect(await screen.findByText('1 이상의 정수를 입력하세요')).toBeInTheDocument()
    expect(mockClient.post).not.toHaveBeenCalled()
  })
})

describe('AdminPayoutTab 확인 다이얼로그 및 전송', () => {
  async function fillValidForm() {
    const user = userEvent.setup()
    renderTab()
    await screen.findByText('지갑 잔액 50,000 sats')

    await user.type(screen.getByPlaceholderText('you@wallet.com'), 'user@example.com')
    await user.type(screen.getByPlaceholderText('예: 100'), '100')
    await user.click(screen.getByRole('button', { name: '전송' }))
    return user
  }

  it('전송 버튼을 누르면 확인 다이얼로그를 보여주고, 취소하면 API를 호출하지 않는다', async () => {
    const user = await fillValidForm()

    expect(await screen.findByText('비트코인 전송 확인')).toBeInTheDocument()
    expect(
      screen.getByText('user@example.com로 100 sats를 보냅니다. 되돌릴 수 없습니다.'),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '취소' }))
    expect(screen.queryByText('비트코인 전송 확인')).not.toBeInTheDocument()
    expect(mockClient.post).not.toHaveBeenCalled()
  })

  it('확인하면 올바른 body로 API를 호출하고 성공 메시지를 보여준다', async () => {
    mockClient.post.mockResolvedValue({
      data: { data: { status: 'SUCCESS', ln_address: 'user@example.com', amount_sats: 100 } },
    })
    const user = await fillValidForm()
    await screen.findByText('비트코인 전송 확인')

    await user.click(screen.getByRole('button', { name: '네, 전송합니다' }))

    expect(mockClient.post).toHaveBeenCalledWith('/admin/blink/test-payout', {
      ln_address: 'user@example.com',
      amount_sats: 100,
      memo: null,
    })
    expect(await screen.findByText('전송 성공')).toBeInTheDocument()
    expect(screen.getByText('user@example.com로 100 sats를 보냈습니다.')).toBeInTheDocument()
  })

  it('메모를 입력하면 body에 포함해서 호출한다', async () => {
    mockClient.post.mockResolvedValue({
      data: { data: { status: 'PENDING', ln_address: 'user@example.com', amount_sats: 100 } },
    })
    const user = userEvent.setup()
    renderTab()
    await screen.findByText('지갑 잔액 50,000 sats')

    await user.type(screen.getByPlaceholderText('you@wallet.com'), 'user@example.com')
    await user.type(screen.getByPlaceholderText('예: 100'), '100')
    await user.type(screen.getByPlaceholderText('테스트 지급 메모'), '테스트 메모')
    await user.click(screen.getByRole('button', { name: '전송' }))
    await screen.findByText('비트코인 전송 확인')
    await user.click(screen.getByRole('button', { name: '네, 전송합니다' }))

    expect(mockClient.post).toHaveBeenCalledWith('/admin/blink/test-payout', {
      ln_address: 'user@example.com',
      amount_sats: 100,
      memo: '테스트 메모',
    })
    expect(await screen.findByText('전송 대기 중')).toBeInTheDocument()
  })

  it('서버가 FAILURE 상태를 응답하면 실패 메시지를 보여준다', async () => {
    mockClient.post.mockResolvedValue({
      data: { data: { status: 'FAILURE', ln_address: 'user@example.com', amount_sats: 100 } },
    })
    const user = await fillValidForm()
    await screen.findByText('비트코인 전송 확인')
    await user.click(screen.getByRole('button', { name: '네, 전송합니다' }))

    expect(await screen.findByText('전송 실패')).toBeInTheDocument()
  })

  it('API 요청 자체가 실패하면 에러 메시지를 보여준다', async () => {
    mockClient.post.mockRejectedValue(new Error('network down'))
    const user = await fillValidForm()
    await screen.findByText('비트코인 전송 확인')
    await user.click(screen.getByRole('button', { name: '네, 전송합니다' }))

    expect(await screen.findByText('전송 요청에 실패했습니다')).toBeInTheDocument()
  })
})
