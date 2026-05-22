import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import client from '../api/client'
import { useAuthStore } from '../store/auth'
import type { User } from '../api/types'
import LogoMark from '../components/LogoMark'

export default function LoginPage() {
  const navigate = useNavigate()
  const login = useAuthStore((s) => s.login)
  const [isRegister, setIsRegister] = useState(false)
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (isRegister) {
        const res = await client.post<{ data: { access_token: string; user: User } }>(
          '/auth/register',
          { email, username, password },
        )
        login(res.data.data.access_token, res.data.data.user)
      } else {
        const res = await client.post<{ data: { access_token: string; user: User } }>(
          '/auth/login',
          { email, password },
        )
        login(res.data.data.access_token, res.data.data.user)
      }
      navigate('/')
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? '오류가 발생했습니다'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-theme-page px-6">
      <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-theme-surface text-accent shadow-lg shadow-black/20">
        <LogoMark aria-label="Stack Health 로고" role="img" size={52} />
      </div>
      <p className="mb-2 text-xs font-bold tracking-[0.28em] text-accent uppercase">
        Stack Health
      </p>
      <h1 className="text-center text-2xl font-black text-theme-primary">
        운동 기록이 쌓이면 스코어가 됩니다
      </h1>
      <p className="mb-8 mt-3 max-w-sm text-center text-sm leading-6 text-theme-muted">
        15초 운동 기록을 공유하고, 커뮤니티 반응으로 꾸준함을 이어가세요.
        운동하고 비트코인 리워드 경험도 함께 확인할 수 있어요.
      </p>

      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-3">
        <input
          type="email"
          placeholder="이메일"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full rounded-lg bg-theme-surface px-4 py-3 text-theme-primary placeholder-theme-subtle outline-none focus:ring-2 focus:ring-accent"
        />
        {isRegister && (
          <input
            type="text"
            placeholder="닉네임"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            className="w-full rounded-lg bg-theme-surface px-4 py-3 text-theme-primary placeholder-theme-subtle outline-none focus:ring-2 focus:ring-accent"
          />
        )}
        <input
          type="password"
          placeholder="비밀번호"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="w-full rounded-lg bg-theme-surface px-4 py-3 text-theme-primary placeholder-theme-subtle outline-none focus:ring-2 focus:ring-accent"
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-accent py-3 font-semibold text-accent-fg transition-opacity disabled:opacity-60"
        >
          {loading ? '처리 중...' : isRegister ? '회원가입' : '로그인'}
        </button>
      </form>

      <button
        onClick={() => setIsRegister((v) => !v)}
        className="mt-4 text-sm text-theme-muted underline"
      >
        {isRegister ? '이미 계정이 있어요' : '계정이 없어요'}
      </button>
    </div>
  )
}
