import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import client from '../api/client'
import { getApiErrorMessage } from '../api/errors'
import { useAuthStore } from '../store/auth'
import type { User } from '../api/types'
import LogoMark from '../components/LogoMark'

export default function RegisterPage() {
  const navigate = useNavigate()
  const login = useAuthStore((s) => s.login)

  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [lightningAddress, setLightningAddress] = useState('')
  const [emailError, setEmailError] = useState('')
  const [emailLoading, setEmailLoading] = useState(false)

  function isValidLightningAddress(addr: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setEmailError('')

    if (lightningAddress.trim() && !isValidLightningAddress(lightningAddress.trim())) {
      setEmailError('라이트닝 주소 형식이 올바르지 않습니다 (예: user@walletofsatoshi.com)')
      return
    }

    setEmailLoading(true)
    try {
      const res = await client.post<{ data: { access_token: string; user: User } }>(
        '/auth/register',
        { email, username, password },
      )
      const { access_token, user: registeredUser } = res.data.data
      if (lightningAddress.trim()) {
        const updated = await client.patch<{ data: User }>(
          '/auth/me',
          { lightning_address: lightningAddress.trim() },
          { headers: { Authorization: `Bearer ${access_token}` } },
        )
        login(access_token, updated.data.data)
      } else {
        login(access_token, registeredUser)
      }
      navigate('/')
    } catch (err: unknown) {
      setEmailError(getApiErrorMessage(err, '오류가 발생했습니다'))
    } finally {
      setEmailLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-theme-page px-6">
      <div className="mb-2 flex h-16 w-16 items-center justify-center rounded-2xl bg-theme-surface text-accent">
        <LogoMark aria-label="Stack Health 로고" role="img" size={40} />
      </div>
      <p className="mb-1 text-2xl font-bold text-accent">Stack Health</p>
      <p className="mb-8 text-sm text-theme-muted">회원가입</p>

      <div className="w-full max-w-sm">
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="email"
            placeholder="이메일"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded-lg bg-theme-surface px-4 py-3 text-theme-primary placeholder-theme-subtle outline-none focus:ring-2 focus:ring-accent"
          />
          <input
            type="text"
            placeholder="닉네임"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            className="w-full rounded-lg bg-theme-surface px-4 py-3 text-theme-primary placeholder-theme-subtle outline-none focus:ring-2 focus:ring-accent"
          />
          <input
            type="text"
            placeholder="라이트닝 주소 (선택, 예: user@walletofsatoshi.com)"
            value={lightningAddress}
            onChange={(e) => setLightningAddress(e.target.value)}
            className="w-full rounded-lg bg-theme-surface px-4 py-3 text-theme-primary placeholder-theme-subtle outline-none focus:ring-2 focus:ring-accent"
          />
          <div className="flex justify-end -mt-2">
            <Link
              to="/lightning-guide"
              className="text-xs text-accent underline underline-offset-2"
            >
              지갑 만드는 법
            </Link>
          </div>
          <input
            type="password"
            placeholder="비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full rounded-lg bg-theme-surface px-4 py-3 text-theme-primary placeholder-theme-subtle outline-none focus:ring-2 focus:ring-accent"
          />
          {emailError && <p className="text-sm text-red-400">{emailError}</p>}
          <button
            type="submit"
            disabled={emailLoading}
            className="w-full rounded-lg bg-accent py-3 font-semibold text-accent-fg transition-opacity disabled:opacity-60"
          >
            {emailLoading ? '처리 중...' : '회원가입'}
          </button>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="w-full text-sm text-theme-muted underline"
          >
            이미 계정이 있어요
          </button>
        </form>
      </div>
    </div>
  )
}
