import { Moon, Sun, ChevronLeft, Zap, Check, X, Smartphone, Download, ChevronRight, ChevronDown } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import client from '../api/client'
import { useAuthStore } from '../store/auth'
import { useThemeStore, type Theme } from '../store/theme'

const ROW = 'flex items-center justify-between px-4 py-3.5'
const LABEL = 'text-sm text-theme-primary'
const DIVIDER = 'border-b border-theme-border/40'
const GROUP = 'rounded-xl bg-theme-surface overflow-hidden'
const SECTION = 'text-[10px] font-medium uppercase tracking-widest text-theme-muted px-1 mb-2'

export default function SettingsPage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)
  const { theme, setTheme } = useThemeStore()

  const [editingLn, setEditingLn] = useState(false)
  const [lnInput, setLnInput] = useState(user?.lightning_address ?? '')
  const [saving, setSaving] = useState(false)
  const [lnSaved, setLnSaved] = useState(false)

  const [editingUsername, setEditingUsername] = useState(false)
  const [usernameInput, setUsernameInput] = useState(user?.username ?? '')
  const [usernameError, setUsernameError] = useState('')
  const [savingUsername, setSavingUsername] = useState(false)
  const [usernameSaved, setUsernameSaved] = useState(false)

  const [showIosGuide, setShowIosGuide] = useState(false)

  const { data: appLinks } = useQuery<{ android_url: string | null; android_filename: string | null }>({
    queryKey: ['app-links'],
    queryFn: async () => {
      const res = await client.get<{ data: { android_url: string | null; android_filename: string | null } }>('/admin/app-links')
      return res.data.data
    },
  })

  const DARK_THEMES: Theme[] = ['volt', 'sapphire', 'indigo']
  const isDark = DARK_THEMES.includes(theme)

  async function handleThemeChange(dark: boolean) {
    const next: Theme = dark ? 'volt' : 'volt-light'
    setTheme(next)
    try {
      const res = await client.patch<{ data: typeof user }>('/auth/me', {
        app_settings: { ...((user?.app_settings ?? {}) as object), theme: next },
      })
      if (res.data.data) setUser(res.data.data)
    } catch { /* theme already applied locally */ }
  }

  async function saveUsername(e: FormEvent) {
    e.preventDefault()
    if (usernameInput.trim().length < 2 || usernameInput.trim().length > 30) {
      setUsernameError('2~30자 사이로 입력해주세요')
      return
    }
    setSavingUsername(true)
    setUsernameError('')
    try {
      const res = await client.patch<{ data: typeof user }>('/auth/me', { username: usernameInput.trim() })
      if (res.data.data) setUser(res.data.data)
      setEditingUsername(false)
      setUsernameSaved(true)
      setTimeout(() => setUsernameSaved(false), 2000)
    } catch {
      setUsernameError('이미 사용 중인 닉네임입니다')
    } finally {
      setSavingUsername(false)
    }
  }

  async function saveLightningAddress(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await client.patch<{ data: typeof user }>('/auth/me', { lightning_address: lnInput.trim() })
      if (res.data.data) setUser(res.data.data)
      setEditingLn(false)
      setLnSaved(true)
      setTimeout(() => setLnSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-theme-page pb-nav-safe">
      {/* 헤더 */}
      <div className="flex items-center gap-3 px-4 pt-5 pb-4 border-b border-theme-surface">
        <button onClick={() => navigate(-1)} className="p-1 text-theme-muted hover:text-theme-primary transition-colors">
          <ChevronLeft size={20} strokeWidth={1.5} />
        </button>
        <h1 className="text-base font-bold text-theme-primary">설정</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pt-4 space-y-4">

        {/* 계정 */}
        <div>
          <p className={SECTION}>계정</p>
          <div className={GROUP}>
            {/* 닉네임 */}
            <div className={`${DIVIDER}`}>
              <div className={ROW}>
                <span className={LABEL}>닉네임</span>
                {!editingUsername ? (
                  <button
                    onClick={() => { setEditingUsername(true); setUsernameInput(user?.username ?? '') }}
                    className="flex items-center gap-1.5 text-sm text-theme-subtle hover:text-theme-primary transition-colors"
                  >
                    @{user?.username}
                    {usernameSaved && <Check size={11} className="text-green-400" />}
                  </button>
                ) : (
                  <form onSubmit={saveUsername} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={usernameInput}
                      onChange={(e) => setUsernameInput(e.target.value)}
                      autoFocus
                      maxLength={30}
                      className="w-36 bg-theme-surface2 rounded-lg px-2.5 py-1 text-sm text-theme-primary outline-none border border-accent"
                    />
                    <button type="submit" disabled={savingUsername} className="text-accent disabled:opacity-50">
                      <Check size={15} />
                    </button>
                    <button type="button" onClick={() => { setEditingUsername(false); setUsernameError('') }} className="text-theme-muted">
                      <X size={15} />
                    </button>
                  </form>
                )}
              </div>
              {usernameError && <p className="text-[10px] text-red-400 px-4 pb-2">{usernameError}</p>}
            </div>

            {/* 이메일 */}
            <div className={ROW}>
              <span className={LABEL}>이메일</span>
              <span className="text-sm text-theme-subtle truncate max-w-[180px]">{user?.email}</span>
            </div>
          </div>
        </div>

        {/* 화면 */}
        <div>
          <p className={SECTION}>화면</p>
          <div className={GROUP}>
            <div className={ROW}>
              <span className={LABEL}>테마</span>
              <div className="flex items-center gap-1 rounded-lg bg-theme-surface2 p-0.5">
                <button
                  onClick={() => handleThemeChange(true)}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    isDark ? 'bg-theme-page text-theme-primary shadow-sm' : 'text-theme-muted'
                  }`}
                >
                  <Moon size={11} strokeWidth={1.5} />다크
                </button>
                <button
                  onClick={() => handleThemeChange(false)}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    !isDark ? 'bg-theme-page text-theme-primary shadow-sm' : 'text-theme-muted'
                  }`}
                >
                  <Sun size={11} strokeWidth={1.5} />라이트
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 결제 */}
        <div>
          <p className={SECTION}>결제</p>
          <div className={GROUP}>
            <div className={editingLn ? DIVIDER : ''}>
              <div className={ROW}>
                <div className="flex items-center gap-2">
                  <Zap size={13} className="text-accent" />
                  <span className={LABEL}>Lightning 주소</span>
                </div>
                {!editingLn ? (
                  <button
                    onClick={() => { setEditingLn(true); setLnInput(user?.lightning_address ?? '') }}
                    className="flex items-center gap-1.5 text-sm text-theme-subtle hover:text-theme-primary transition-colors truncate max-w-[160px]"
                  >
                    {lnSaved ? <span className="flex items-center gap-1 text-green-400"><Check size={11} />저장됨</span>
                      : user?.lightning_address ?? '설정하기'}
                  </button>
                ) : null}
              </div>
              {editingLn && (
                <form onSubmit={saveLightningAddress} className="px-4 pb-3">
                  <div className="flex items-center gap-2 rounded-lg bg-theme-surface2 px-3 py-2">
                    <input
                      type="text"
                      value={lnInput}
                      onChange={(e) => setLnInput(e.target.value)}
                      placeholder="you@wallet.com"
                      autoFocus
                      className="flex-1 bg-transparent text-sm text-theme-primary outline-none font-mono"
                    />
                    <button type="submit" disabled={saving} className="text-accent disabled:opacity-50">
                      <Check size={15} />
                    </button>
                    <button type="button" onClick={() => setEditingLn(false)} className="text-theme-muted">
                      <X size={15} />
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>

        {/* 앱 다운로드 */}
        <div>
          <p className={SECTION}>앱 다운로드</p>
          <div className={GROUP}>
            {/* Android */}
            {appLinks?.android_url ? (
              <a
                href={appLinks.android_url}
                target="_blank"
                rel="noopener noreferrer"
                className={`${ROW} ${DIVIDER}`}
              >
                <div className="flex items-center gap-2">
                  <Smartphone size={13} className="text-[#3DDC84]" />
                  <span className={LABEL}>Android APK</span>
                </div>
                <Download size={14} className="text-theme-muted" />
              </a>
            ) : (
              <div className={`${ROW} ${DIVIDER} opacity-40`}>
                <div className="flex items-center gap-2">
                  <Smartphone size={13} className="text-theme-muted" />
                  <span className={LABEL}>Android APK</span>
                </div>
                <span className="text-xs text-theme-muted">준비 중</span>
              </div>
            )}

            {/* iOS PWA */}
            <button
              onClick={() => setShowIosGuide((v) => !v)}
              className={`w-full ${ROW} ${showIosGuide ? DIVIDER : ''}`}
            >
              <div className="flex items-center gap-2">
                <Smartphone size={13} className="text-blue-400" />
                <span className={LABEL}>iPhone / iPad (PWA)</span>
              </div>
              <ChevronDown size={14} className={`text-theme-muted transition-transform ${showIosGuide ? 'rotate-180' : ''}`} />
            </button>

            {showIosGuide && (
              <div className="px-4 pb-3 space-y-1.5">
                {['1. Safari로 이 사이트에 접속', '2. 하단 공유 버튼(□↑) 탭', '3. "홈 화면에 추가" 선택', '4. "추가" 탭'].map((step) => (
                  <p key={step} className="text-xs text-theme-subtle">{step}</p>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 정보 */}
        <div>
          <p className={SECTION}>정보</p>
          <div className={GROUP}>
            <button
              onClick={() => navigate('/terms')}
              className={`w-full ${ROW} ${DIVIDER}`}
            >
              <span className={LABEL}>이용약관</span>
              <ChevronRight size={14} className="text-theme-muted" />
            </button>
            <div className={ROW}>
              <span className={LABEL}>버전</span>
              <span className="text-sm text-theme-subtle font-mono">v{__APP_VERSION__}</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
