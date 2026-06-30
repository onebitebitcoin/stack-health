import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useAuthStore } from '../store/auth'

// axios mock — client 인스턴스를 콜러블 함수로 만들어 인터셉터 재시도(client(original))를 검증 가능하게 한다.
const { rawPost } = vi.hoisted(() => ({ rawPost: vi.fn() }))

vi.mock('axios', () => {
  const mockClient = vi.fn() as ReturnType<typeof vi.fn> & Record<string, unknown> // client(config) 재시도 호출용
  mockClient.get = vi.fn()
  mockClient.post = vi.fn()
  mockClient.delete = vi.fn()
  mockClient.patch = vi.fn()
  mockClient.interceptors = {
    request: { use: vi.fn() },
    response: { use: vi.fn() },
  }
  return {
    default: {
      create: vi.fn(() => mockClient),
      post: rawPost, // refreshAccessToken 내부의 raw axios.post
    },
  }
})

const mockUser = {
  id: 1,
  email: 'test@example.com',
  username: 'tester',
  lightning_address: null,
  avatar_url: null,
  is_admin: false,
  app_settings: {},
}

// client.ts를 import하면 인터셉터가 등록된다. 등록된 에러 핸들러를 꺼내 직접 호출한다.
import '../api/client'
import axios from 'axios'

const mockClient = (axios as unknown as { create: () => unknown }).create() as {
  interceptors: { response: { use: { mock: { calls: unknown[][] } } } }
}

// 인터셉터는 import 시점에 한 번 등록된다. clearAllMocks가 호출 기록을 지우기 전에 핸들러를 캡처한다.
const errorHandler = mockClient.interceptors.response.use.mock.calls[0][1] as (
  err: unknown,
) => Promise<unknown>

function getErrorHandler(): (err: unknown) => Promise<unknown> {
  return errorHandler
}

beforeEach(() => {
  useAuthStore.setState({ token: null, refreshToken: null, user: null })
  vi.clearAllMocks()
})

describe('auth store', () => {
  it('로그아웃 후 token/refreshToken 모두 null', () => {
    useAuthStore.getState().login('tok', mockUser, 'ref')
    useAuthStore.getState().logout()
    expect(useAuthStore.getState().token).toBeNull()
    expect(useAuthStore.getState().refreshToken).toBeNull()
  })

  it('로그인 시 token + refreshToken 저장', () => {
    useAuthStore.getState().login('my-token', mockUser, 'my-refresh')
    expect(useAuthStore.getState().token).toBe('my-token')
    expect(useAuthStore.getState().refreshToken).toBe('my-refresh')
  })

  it('setTokens로 두 토큰 동시 갱신', () => {
    useAuthStore.getState().login('old', mockUser, 'oldref')
    useAuthStore.getState().setTokens('new', 'newref')
    expect(useAuthStore.getState().token).toBe('new')
    expect(useAuthStore.getState().refreshToken).toBe('newref')
  })

  it('setUser로 lightning_address 업데이트', () => {
    useAuthStore.getState().login('tok', mockUser)
    useAuthStore.getState().setUser({ ...mockUser, lightning_address: 'user@ln.com', app_settings: {} })
    expect(useAuthStore.getState().user?.lightning_address).toBe('user@ln.com')
  })
})

describe('client 401 인터셉터', () => {
  it('refreshToken 없으면 즉시 로그아웃', async () => {
    useAuthStore.setState({ token: 'tok', refreshToken: null, user: mockUser })
    const handler = getErrorHandler()
    const err = { response: { status: 401 }, config: { url: '/feed' } }
    await expect(handler(err)).rejects.toBe(err)
    expect(useAuthStore.getState().token).toBeNull()
  })

  it('401 → refresh 성공 시 새 토큰 저장 후 원요청 재시도', async () => {
    useAuthStore.setState({ token: 'old', refreshToken: 'goodref', user: mockUser })
    rawPost.mockResolvedValueOnce({
      data: { data: { access_token: 'newacc', refresh_token: 'newref' } },
    })
    const retryResult = { data: 'ok' }
    ;(mockClient as unknown as { mockResolvedValueOnce: (v: unknown) => void }).mockResolvedValueOnce?.(retryResult)

    const handler = getErrorHandler()
    const err = { response: { status: 401 }, config: { url: '/feed', headers: {} } }
    await handler(err)

    expect(rawPost).toHaveBeenCalledWith('/api/v1/auth/refresh', { refresh_token: 'goodref' })
    expect(useAuthStore.getState().token).toBe('newacc')
    expect(useAuthStore.getState().refreshToken).toBe('newref')
  })

  it('401 → refresh 실패 시 로그아웃', async () => {
    useAuthStore.setState({ token: 'old', refreshToken: 'badref', user: mockUser })
    rawPost.mockRejectedValueOnce(new Error('refresh failed'))
    const handler = getErrorHandler()
    const err = { response: { status: 401 }, config: { url: '/feed', headers: {} } }
    await expect(handler(err)).rejects.toBe(err)
    expect(useAuthStore.getState().token).toBeNull()
  })

  it('refresh 엔드포인트 자체 401은 재귀 없이 로그아웃', async () => {
    useAuthStore.setState({ token: 'old', refreshToken: 'ref', user: mockUser })
    const handler = getErrorHandler()
    const err = { response: { status: 401 }, config: { url: '/api/v1/auth/refresh', headers: {} } }
    await expect(handler(err)).rejects.toBe(err)
    expect(rawPost).not.toHaveBeenCalled()
    expect(useAuthStore.getState().token).toBeNull()
  })
})
