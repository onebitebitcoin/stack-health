import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { Zap, Mail, AlertCircle, Copy, Check, ArrowLeft } from 'lucide-react'
import client from '../api/client'
import { getApiErrorMessage } from '../api/errors'
import { LN_POLL_INTERVAL_MS, LN_LOGIN_EXPIRE_MS } from '../lib/constants'
import { useAuthStore } from '../store/auth'
import type { User } from '../api/types'
import LogoMark from '../components/LogoMark'

type Mode = 'default' | 'lightning' | 'email'

export default function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const login = useAuthStore((s) => s.login)

  const [mode, setMode] = useState<Mode>('default')

  // Google state
  const [googleLoading, setGoogleLoading] = useState(false)
  const [googleError, setGoogleError] = useState('')

  // Email form state
  const [isRegister, setIsRegister] = useState(false)
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [emailError, setEmailError] = useState('')
  const [emailLoading, setEmailLoading] = useState(false)

  // Lightning state
  const [lnChallenge, setLnChallenge] = useState<{ k1: string; lnurl: string } | null>(null)
  const [lnError, setLnError] = useState('')
  const [lnLoading, setLnLoading] = useState(false)
  const [lnExpired, setLnExpired] = useState(false)
  const [lnCopied, setLnCopied] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const errorParam = searchParams.get('error')

  async function handleGoogleLogin() {
    setGoogleLoading(true)
    setGoogleError('')
    try {
      const res = await fetch('/api/v1/auth/google', { redirect: 'manual' })
      if (res.type === 'opaqueredirect') {
        window.location.href = '/api/v1/auth/google'
      } else {
        const data = await res.json().catch(() => ({}))
        const msg = (data as { detail?: string }).detail
        setGoogleError(msg ?? 'Google 로그인을 사용할 수 없습니다')
        setGoogleLoading(false)
      }
    } catch {
      setGoogleError('서버에 연결할 수 없습니다')
      setGoogleLoading(false)
    }
  }

  useEffect(() => {
    if (mode !== 'lightning') {
      if (pollRef.current) clearInterval(pollRef.current)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      setLnChallenge(null)
      setLnError('')
      setLnExpired(false)
      return
    }
    setLnLoading(true)
    setLnError('')
    setLnExpired(false)
    client
      .get<{ data: { k1: string; lnurl: string } }>('/auth/lnauth/challenge')
      .then((res) => {
        const { k1, lnurl } = res.data.data
        setLnChallenge({ k1, lnurl })
        setLnLoading(false)
        pollRef.current = setInterval(async () => {
          try {
            const r = await client.get<{ data: { verified: boolean; token?: string; is_new_user?: boolean } }>(
              `/auth/lnauth/verify?k1=${k1}`,
            )
            if (r.data.data.verified && r.data.data.token) {
              if (pollRef.current) clearInterval(pollRef.current)
              if (timeoutRef.current) clearTimeout(timeoutRef.current)
              const token = r.data.data.token
              if (r.data.data.is_new_user) {
                navigate(`/setup-username?token=${encodeURIComponent(token)}`)
                return
              }
              const me = await client.get<{ data: User }>('/auth/me', {
                headers: { Authorization: `Bearer ${token}` },
              })
              login(token, me.data.data)
              navigate('/')
            }
          } catch {
            // ignore poll errors
          }
        }, LN_POLL_INTERVAL_MS)
        timeoutRef.current = setTimeout(() => {
          if (pollRef.current) clearInterval(pollRef.current)
          setLnExpired(true)
        }, LN_LOGIN_EXPIRE_MS)
      })
      .catch(() => {
        setLnLoading(false)
        setLnError('챌린지 생성에 실패했습니다')
      })
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [mode, login, navigate])

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault()
    setEmailError('')
    setEmailLoading(true)
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
      setEmailError(getApiErrorMessage(err, '오류가 발생했습니다'))
    } finally {
      setEmailLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-theme-page px-6">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-theme-surface text-accent">
        <LogoMark aria-label="Stack Health 로고" role="img" size={40} />
      </div>
      <p className="mb-1 text-xs font-bold tracking-[0.28em] text-accent uppercase">Stack Health</p>
      <p className="mb-8 text-sm text-theme-muted">운동하고 비트코인 받자</p>

      {errorParam && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-500/10 px-4 py-2 text-sm text-red-400">
          <AlertCircle size={16} />
          <span>
            {errorParam === 'google_auth_failed'
              ? 'Google 인증에 실패했습니다. 다시 시도해 주세요.'
              : '로그인에 실패했습니다. 다시 시도해 주세요.'}
          </span>
        </div>
      )}

      <div className="w-full max-w-sm space-y-3">
        {/* ── Default: all options ─────────────────────────────────── */}
        {mode === 'default' && (
          <>
            <div className="flex flex-col gap-1.5">
              <button
                onClick={handleGoogleLogin}
                disabled={googleLoading}
                className="flex w-full items-center justify-center gap-3 rounded-lg border border-theme-border bg-theme-surface px-4 py-3 font-medium text-theme-primary transition-colors hover:bg-theme-surface2 disabled:opacity-60"
              >
                {googleLoading ? (
                  <svg className="h-4 w-4 animate-spin text-theme-muted" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4" />
                    <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853" />
                    <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05" />
                    <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335" />
                  </svg>
                )}
                {googleLoading ? 'Google 연결 중...' : 'Google로 계속하기'}
              </button>
              {googleError && (
                <div className="flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">
                  <AlertCircle size={13} />
                  {googleError}
                </div>
              )}
            </div>

            <button
              onClick={() => setMode('lightning')}
              className="flex w-full items-center justify-center gap-3 rounded-lg border border-theme-border bg-theme-surface px-4 py-3 font-medium text-theme-primary transition-colors hover:bg-theme-surface2"
            >
              <Zap size={18} className="text-yellow-500" />
              Lightning으로 계속하기
            </button>

            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-theme-border" />
              <span className="text-xs text-theme-subtle">또는</span>
              <div className="h-px flex-1 bg-theme-border" />
            </div>

            <button
              onClick={() => setMode('email')}
              className="flex w-full items-center justify-center gap-3 rounded-lg border border-theme-border bg-theme-surface px-4 py-3 font-medium text-theme-primary transition-colors hover:bg-theme-surface2"
            >
              <Mail size={18} className="text-theme-muted" />
              이메일로 로그인
            </button>
          </>
        )}

        {/* ── Lightning full view ───────────────────────────────────── */}
        {mode === 'lightning' && (
          <div className="flex flex-col gap-4">
            <button
              onClick={() => setMode('default')}
              className="flex items-center gap-2 text-sm text-theme-muted hover:text-theme-primary"
            >
              <ArrowLeft size={16} />
              돌아가기
            </button>

            <p className="text-center font-semibold text-theme-primary">Lightning 로그인</p>

            {lnLoading && <p className="text-center text-sm text-theme-muted">챌린지 생성 중...</p>}
            {lnError && <p className="text-center text-sm text-red-400">{lnError}</p>}
            {lnExpired && (
              <div className="text-center">
                <p className="mb-2 text-sm text-theme-muted">QR 코드가 만료되었습니다</p>
                <button
                  onClick={() => {
                    setMode('default')
                    setTimeout(() => setMode('lightning'), 50)
                  }}
                  className="text-sm text-accent underline"
                >
                  다시 생성
                </button>
              </div>
            )}
            {lnChallenge && !lnExpired && (
              <>
                <div className="flex justify-center">
                  <div className="rounded-xl bg-white p-4">
                    <QRCodeSVG value={`lightning:${lnChallenge.lnurl}`} size={200} />
                  </div>
                </div>
                <p className="text-center text-xs text-theme-muted">
                  Lightning 지갑으로 QR 코드를 스캔하세요
                </p>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(lnChallenge.lnurl).then(() => {
                      setLnCopied(true)
                      setTimeout(() => setLnCopied(false), 2000)
                    })
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-theme-border bg-theme-surface px-3 py-3 text-sm text-theme-muted transition-colors hover:bg-theme-surface2"
                >
                  {lnCopied ? (
                    <>
                      <Check size={15} className="text-green-500" />
                      <span className="text-green-500">복사됨</span>
                    </>
                  ) : (
                    <>
                      <Copy size={15} />
                      LNURL 복사하기
                    </>
                  )}
                </button>
                <div className="flex items-center justify-center gap-2 text-xs text-theme-subtle">
                  <div className="h-2 w-2 animate-pulse rounded-full bg-yellow-500" />
                  인증 대기 중...
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Email full view ───────────────────────────────────────── */}
        {mode === 'email' && (
          <div className="flex flex-col gap-3">
            <button
              onClick={() => setMode('default')}
              className="flex items-center gap-2 text-sm text-theme-muted hover:text-theme-primary"
            >
              <ArrowLeft size={16} />
              돌아가기
            </button>

            <p className="text-center font-semibold text-theme-primary">
              {isRegister ? '회원가입' : '이메일 로그인'}
            </p>

            <form onSubmit={handleEmailSubmit} className="flex flex-col gap-3">
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
              {emailError && <p className="text-sm text-red-400">{emailError}</p>}
              <button
                type="submit"
                disabled={emailLoading}
                className="w-full rounded-lg bg-accent py-3 font-semibold text-accent-fg transition-opacity disabled:opacity-60"
              >
                {emailLoading ? '처리 중...' : isRegister ? '회원가입' : '로그인'}
              </button>
              <button
                type="button"
                onClick={() => setIsRegister((v) => !v)}
                className="w-full text-sm text-theme-muted underline"
              >
                {isRegister ? '이미 계정이 있어요' : '계정이 없어요'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
