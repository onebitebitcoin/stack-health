import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { Zap, Mail, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react'
import client from '../api/client'
import { useAuthStore } from '../store/auth'
import type { User } from '../api/types'
import LogoMark from '../components/LogoMark'

export default function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const login = useAuthStore((s) => s.login)

  // Email form state
  const [showEmail, setShowEmail] = useState(false)
  const [isRegister, setIsRegister] = useState(false)
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [emailError, setEmailError] = useState('')
  const [emailLoading, setEmailLoading] = useState(false)

  // Lightning state
  const [showLightning, setShowLightning] = useState(false)
  const [lnChallenge, setLnChallenge] = useState<{ k1: string; lnurl: string } | null>(null)
  const [lnError, setLnError] = useState('')
  const [lnLoading, setLnLoading] = useState(false)
  const [lnExpired, setLnExpired] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const errorParam = searchParams.get('error')

  useEffect(() => {
    if (!showLightning) {
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
            const r = await client.get<{ data: { verified: boolean; token?: string } }>(
              `/auth/lnauth/verify?k1=${k1}`,
            )
            if (r.data.data.verified && r.data.data.token) {
              if (pollRef.current) clearInterval(pollRef.current)
              if (timeoutRef.current) clearTimeout(timeoutRef.current)
              const token = r.data.data.token
              const me = await client.get<{ data: User }>('/auth/me', {
                headers: { Authorization: `Bearer ${token}` },
              })
              login(token, me.data.data)
              navigate('/')
            }
          } catch {
            // ignore poll errors
          }
        }, 2000)
        timeoutRef.current = setTimeout(() => {
          if (pollRef.current) clearInterval(pollRef.current)
          setLnExpired(true)
        }, 120000)
      })
      .catch(() => {
        setLnLoading(false)
        setLnError('챌린지 생성에 실패했습니다')
      })
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [showLightning, login, navigate])

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
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setEmailError(detail ?? '오류가 발생했습니다')
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
      <p className="mb-8 text-sm text-theme-muted">건강과 비트코인, 두 마리 토끼를 한 번에</p>

      {errorParam && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-500/10 px-4 py-2 text-sm text-red-400">
          <AlertCircle size={16} />
          <span>로그인에 실패했습니다. 다시 시도해 주세요.</span>
        </div>
      )}

      <div className="w-full max-w-sm space-y-3">
        {/* Google Login */}
        <button
          onClick={() => {
            window.location.href = '/api/v1/auth/google'
          }}
          className="flex w-full items-center justify-center gap-3 rounded-lg border border-theme-border bg-theme-surface px-4 py-3 font-medium text-theme-primary transition-colors hover:bg-theme-surface2"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path
              d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
              fill="#4285F4"
            />
            <path
              d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
              fill="#34A853"
            />
            <path
              d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
              fill="#FBBC05"
            />
            <path
              d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
              fill="#EA4335"
            />
          </svg>
          Google로 계속하기
        </button>

        {/* Lightning Login */}
        <div className="overflow-hidden rounded-lg border border-theme-border bg-theme-surface">
          <button
            onClick={() => setShowLightning((v) => !v)}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 font-medium text-theme-primary transition-colors hover:bg-theme-surface2"
          >
            <div className="flex items-center gap-3">
              <Zap size={18} className="text-yellow-500" />
              Lightning으로 계속하기
            </div>
            {showLightning ? (
              <ChevronUp size={16} className="text-theme-muted" />
            ) : (
              <ChevronDown size={16} className="text-theme-muted" />
            )}
          </button>

          {showLightning && (
            <div className="flex flex-col items-center border-t border-theme-border px-4 pb-4 pt-4">
              {lnLoading && <p className="text-sm text-theme-muted">챌린지 생성 중...</p>}
              {lnError && <p className="text-sm text-red-400">{lnError}</p>}
              {lnExpired && (
                <div className="text-center">
                  <p className="mb-2 text-sm text-theme-muted">QR 코드가 만료되었습니다</p>
                  <button
                    onClick={() => {
                      setShowLightning(false)
                      setTimeout(() => setShowLightning(true), 100)
                    }}
                    className="text-sm text-accent underline"
                  >
                    다시 생성
                  </button>
                </div>
              )}
              {lnChallenge && !lnExpired && (
                <div className="flex flex-col items-center gap-3">
                  <div className="rounded-lg bg-white p-3">
                    <QRCodeSVG value={`lightning:${lnChallenge.lnurl}`} size={180} />
                  </div>
                  <p className="text-center text-xs text-theme-muted">
                    Lightning 지갑으로 QR 코드를 스캔하세요
                  </p>
                  <div className="flex items-center gap-2 text-xs text-theme-subtle">
                    <div className="h-2 w-2 animate-pulse rounded-full bg-yellow-500" />
                    인증 대기 중...
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-theme-border" />
          <span className="text-xs text-theme-subtle">또는</span>
          <div className="h-px flex-1 bg-theme-border" />
        </div>

        {/* Email Login */}
        <div className="overflow-hidden rounded-lg border border-theme-border bg-theme-surface">
          <button
            onClick={() => setShowEmail((v) => !v)}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 font-medium text-theme-primary transition-colors hover:bg-theme-surface2"
          >
            <div className="flex items-center gap-3">
              <Mail size={18} className="text-theme-muted" />
              이메일로 {isRegister ? '회원가입' : '로그인'}
            </div>
            {showEmail ? (
              <ChevronUp size={16} className="text-theme-muted" />
            ) : (
              <ChevronDown size={16} className="text-theme-muted" />
            )}
          </button>

          {showEmail && (
            <form
              onSubmit={handleEmailSubmit}
              className="space-y-3 border-t border-theme-border px-4 pb-4 pt-4"
            >
              <input
                type="email"
                placeholder="이메일"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-lg bg-theme-page px-4 py-3 text-theme-primary placeholder-theme-subtle outline-none focus:ring-2 focus:ring-accent"
              />
              {isRegister && (
                <input
                  type="text"
                  placeholder="닉네임"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  className="w-full rounded-lg bg-theme-page px-4 py-3 text-theme-primary placeholder-theme-subtle outline-none focus:ring-2 focus:ring-accent"
                />
              )}
              <input
                type="password"
                placeholder="비밀번호"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full rounded-lg bg-theme-page px-4 py-3 text-theme-primary placeholder-theme-subtle outline-none focus:ring-2 focus:ring-accent"
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
          )}
        </div>
      </div>
    </div>
  )
}
