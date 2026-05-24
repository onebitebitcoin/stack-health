import { describe, it, expect, beforeEach } from 'vitest'
import { useAuthStore } from '../store/auth'

const mockUser = {
  id: 1,
  email: 'test@example.com',
  username: 'testuser',
  lightning_address: null,
  avatar_url: null,
  is_admin: false,
  app_settings: {},
}

beforeEach(() => {
  useAuthStore.setState({ token: null, user: null })
})

describe('useAuthStore', () => {
  it('초기 상태는 token과 user가 null', () => {
    const { token, user } = useAuthStore.getState()
    expect(token).toBeNull()
    expect(user).toBeNull()
  })

  it('login은 token과 user를 설정한다', () => {
    useAuthStore.getState().login('tok123', mockUser)
    const { token, user } = useAuthStore.getState()
    expect(token).toBe('tok123')
    expect(user).toEqual(mockUser)
  })

  it('logout은 token과 user를 null로 초기화한다', () => {
    useAuthStore.getState().login('tok123', mockUser)
    useAuthStore.getState().logout()
    const { token, user } = useAuthStore.getState()
    expect(token).toBeNull()
    expect(user).toBeNull()
  })

  it('setUser는 user만 업데이트한다', () => {
    useAuthStore.getState().login('tok123', mockUser)
    const updated = { ...mockUser, username: 'newname' }
    useAuthStore.getState().setUser(updated)
    const { token, user } = useAuthStore.getState()
    expect(token).toBe('tok123')
    expect(user?.username).toBe('newname')
  })

  it('로그인 후 is_admin 필드를 유지한다', () => {
    const adminUser = { ...mockUser, is_admin: true }
    useAuthStore.getState().login('admin-tok', adminUser)
    expect(useAuthStore.getState().user?.is_admin).toBe(true)
  })
})
