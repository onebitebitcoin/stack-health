import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useAuthStore } from '../store/auth'

// axios mock
vi.mock('axios', () => {
  const mockClient = {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
    patch: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  }
  return {
    default: {
      create: vi.fn(() => mockClient),
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

beforeEach(() => {
  useAuthStore.setState({ token: null, user: null })
  vi.clearAllMocks()
})

describe('auth store + client integration', () => {
  it('로그아웃 후 token이 null임을 확인', () => {
    useAuthStore.getState().login('tok', mockUser)
    useAuthStore.getState().logout()
    expect(useAuthStore.getState().token).toBeNull()
  })

  it('로그인 시 token이 저장됨', () => {
    useAuthStore.getState().login('my-token', mockUser)
    expect(useAuthStore.getState().token).toBe('my-token')
  })

  it('setUser로 lightning_address 업데이트', () => {
    useAuthStore.getState().login('tok', mockUser)
    useAuthStore.getState().setUser({ ...mockUser, lightning_address: 'user@ln.com', app_settings: {} })
    expect(useAuthStore.getState().user?.lightning_address).toBe('user@ln.com')
  })
})
