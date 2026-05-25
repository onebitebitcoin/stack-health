import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCircle, XCircle } from 'lucide-react'
import client from '../api/client'
import { getApiErrorMessage } from '../api/errors'
import { useAuthStore } from '../store/auth'
import type { User } from '../api/types'
import LogoMark from '../components/LogoMark'

export default function SetupUsernamePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const login = useAuthStore((s) => s.login)

  const token = searchParams.get('token')

  const [username, setUsername] = useState('')
  const [available, setAvailable] = useState<boolean | null>(null)
  const [checking, setChecking] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!token) {
      navigate('/login', { replace: true })
    }
  }, [token, navigate])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (username.length < 2) {
      setAvailable(null)
      return
    }
    setChecking(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await client.get<{ data: { available: boolean } }>(
          `/auth/check-username?username=${encodeURIComponent(username)}`,
        )
        setAvailable(res.data.data.available)
      } catch {
        setAvailable(null)
      } finally {
        setChecking(false)
      }
    }, 400)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [username])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!token || !available) return
    setError('')
    setSubmitting(true)
    try {
      await client.patch('/auth/me', { username }, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const me = await client.get<{ data: User }>('/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      })
      login(token, me.data.data)
      navigate('/', { replace: true })
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, '닉네임 설정에 실패했습니다'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-theme-page px-6">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-theme-surface text-accent">
        <LogoMark aria-label="Stack Health 로고" role="img" size={40} />
      </div>
      <p className="mb-1 text-xs font-bold tracking-[0.28em] text-accent uppercase">Stack Health</p>
      <p className="mb-8 text-sm text-theme-muted">닉네임을 설정해주세요</p>

      <div className="w-full max-w-sm">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="relative">
            <input
              type="text"
              placeholder="닉네임 (2~30자)"
              value={username}
              onChange={(e) => setUsername(e.target.value.trim())}
              minLength={2}
              maxLength={30}
              required
              className="w-full rounded-lg bg-theme-surface px-4 py-3 pr-10 text-theme-primary placeholder-theme-subtle outline-none focus:ring-2 focus:ring-accent"
            />
            {username.length >= 2 && !checking && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {available === true && <CheckCircle size={18} className="text-green-500" />}
                {available === false && <XCircle size={18} className="text-red-400" />}
              </div>
            )}
            {checking && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
              </div>
            )}
          </div>

          {username.length >= 2 && !checking && (
            <p className={`-mt-2 text-xs ${available ? 'text-green-500' : 'text-red-400'}`}>
              {available ? '사용 가능한 닉네임이에요' : '이미 사용 중인 닉네임이에요'}
            </p>
          )}

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={!available || submitting}
            className="w-full rounded-lg bg-accent py-3 font-semibold text-accent-fg transition-opacity disabled:opacity-40"
          >
            {submitting ? '설정 중...' : '시작하기'}
          </button>
        </form>
      </div>
    </div>
  )
}
