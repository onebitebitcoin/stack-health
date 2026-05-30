import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { CheckCircle, XCircle, Camera, Zap } from 'lucide-react'
import client from '../api/client'
import { getApiErrorMessage } from '../api/errors'
import { useAuthStore } from '../store/auth'
import type { User } from '../api/types'
import LogoMark from '../components/LogoMark'
import { getProfileColor } from '../utils/profileColor'

const PROFILE_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f97316',
  '#14b8a6', '#22c55e', '#3b82f6', '#eab308',
]

export default function SetupUsernamePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const login = useAuthStore((s) => s.login)

  const token = searchParams.get('token')

  const [username, setUsername] = useState('')
  const [lightningAddress, setLightningAddress] = useState('')
  const [available, setAvailable] = useState<boolean | null>(null)
  const [checking, setChecking] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [loadingUser, setLoadingUser] = useState(true)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [selectedColor] = useState(() => PROFILE_COLORS[Math.floor(Math.random() * PROFILE_COLORS.length)])
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 토큰 없으면 로그인으로
  useEffect(() => {
    if (!token) {
      navigate('/login', { replace: true })
    }
  }, [token, navigate])

  // 기존 유저 정보 fetch → username 미리 채우기
  useEffect(() => {
    if (!token) return
    client.get<{ data: User }>('/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    }).then((res) => {
      const u = res.data.data
      if (u.username) setUsername(u.username)
      if (u.lightning_address) setLightningAddress(u.lightning_address)
      if (u.avatar_url) setPreviewUrl(u.avatar_url)
    }).catch(() => {}).finally(() => setLoadingUser(false))
  }, [token])

  // username 중복 체크 (본인 제외)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (username.length < 2) {
      setAvailable(null)
      return
    }
    setChecking(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ username })
        if (token) params.set('token', token)
        const res = await client.get<{ data: { available: boolean } }>(
          `/auth/check-username?${params.toString()}`,
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
  }, [username, token])

  function isValidLightningAddress(addr: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !token) return

    const objectUrl = URL.createObjectURL(file)
    setPreviewUrl(objectUrl)
    setUploading(true)

    try {
      const formData = new FormData()
      formData.append('file', file)
      await client.post<{ data: User }>('/auth/avatar', formData, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' },
      })
    } catch {
      setPreviewUrl(null)
    } finally {
      setUploading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!token || !available) return

    if (lightningAddress.trim() && !isValidLightningAddress(lightningAddress.trim())) {
      setError('라이트닝 주소 형식이 올바르지 않습니다 (예: user@walletofsatoshi.com)')
      return
    }

    setError('')
    setSubmitting(true)
    try {
      const body: Record<string, string> = { username }
      if (lightningAddress.trim()) body.lightning_address = lightningAddress.trim()
      await client.patch('/auth/me', body, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const me = await client.get<{ data: User }>('/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      })
      login(token, me.data.data)
      navigate('/', { replace: true })
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, '프로필 설정에 실패했습니다'))
    } finally {
      setSubmitting(false)
    }
  }

  const displayColor = getProfileColor(username || 'user', selectedColor)

  if (loadingUser) return null

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-theme-page px-6">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-theme-surface text-accent">
        <LogoMark aria-label="Stack Health 로고" role="img" size={40} />
      </div>
      <p className="mb-1 text-xs font-bold tracking-[0.28em] text-accent uppercase">Stack Health</p>
      <p className="mb-8 text-sm text-theme-muted">프로필을 설정해주세요</p>

      <div className="w-full max-w-sm">
        {/* 아바타 선택 */}
        <div className="flex justify-center mb-6">
          <div className="relative">
            <div className="cursor-pointer" onClick={() => fileInputRef.current?.click()}>
              {previewUrl ? (
                <img src={previewUrl} alt="프로필" className="h-20 w-20 rounded-full object-cover" />
              ) : (
                <div
                  className="h-20 w-20 rounded-full flex items-center justify-center font-bold text-white text-3xl"
                  style={{ backgroundColor: displayColor }}
                >
                  {username ? username[0].toUpperCase() : '?'}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-accent text-accent-fg shadow-md disabled:opacity-60"
            >
              {uploading ? (
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent-fg border-t-transparent" />
              ) : (
                <Camera size={13} strokeWidth={2} />
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
        </div>

        <p className="text-center text-xs text-theme-muted mb-6 -mt-2">
          탭하여 사진 변경
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* 닉네임 */}
          <div>
            <p className="text-xs text-theme-muted mb-1.5 ml-1">닉네임</p>
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
              <p className={`mt-1 text-xs ml-1 ${available ? 'text-green-500' : 'text-red-400'}`}>
                {available ? '사용 가능한 닉네임이에요' : '이미 사용 중인 닉네임이에요'}
              </p>
            )}
          </div>

          {/* 라이트닝 주소 */}
          <div>
            <div className="flex items-center justify-between mb-1.5 ml-1">
              <p className="text-xs text-theme-muted">라이트닝 주소 <span className="text-theme-subtle">(선택)</span></p>
              <Link
                to="/lightning-guide"
                className="text-xs text-accent underline underline-offset-2"
              >
                지갑 만드는 법
              </Link>
            </div>
            <div className="relative">
              <Zap size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-yellow-500 pointer-events-none" />
              <input
                type="text"
                placeholder="user@walletofsatoshi.com"
                value={lightningAddress}
                onChange={(e) => setLightningAddress(e.target.value)}
                className="w-full rounded-lg bg-theme-surface py-3 pl-8 pr-4 text-theme-primary placeholder-theme-subtle outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={!available || submitting || uploading}
            className="w-full rounded-lg bg-accent py-3 font-semibold text-accent-fg transition-opacity disabled:opacity-40"
          >
            {submitting ? '설정 중...' : '시작하기'}
          </button>
        </form>
      </div>
    </div>
  )
}
