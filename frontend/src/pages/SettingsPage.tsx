import { Moon, Sun, ChevronLeft, Zap, Check, User, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import client from '../api/client'
import { useAuthStore } from '../store/auth'
import { useThemeStore, type Theme } from '../store/theme'

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
      <div className="flex-none flex items-center gap-3 px-4 pt-5 pb-4 border-b border-theme-surface">
        <button onClick={() => navigate(-1)} className="p-1 text-theme-muted hover:text-theme-primary transition-colors" aria-label="뒤로">
          <ChevronLeft size={20} strokeWidth={1.5} />
        </button>
        <h1 className="text-base font-bold text-theme-primary">설정</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pt-4 space-y-3">

        {/* 계정 */}
        <div>
          <p className="text-[10px] font-medium uppercase tracking-widest text-theme-muted px-1 mb-2">계정</p>
          <div className="rounded-xl bg-theme-surface overflow-hidden">
            {/* 닉네임 */}
            <div className="px-4 py-3 border-b border-theme-border/50">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-theme-muted flex items-center gap-1.5">
                  <User size={11} />닉네임
                </span>
                {!editingUsername ? (
                  <button
                    onClick={() => { setEditingUsername(true); setUsernameInput(user?.username ?? '') }}
                    className="text-xs font-semibold text-theme-primary hover:text-accent transition-colors"
                  >
                    @{user?.username}
                  </button>
                ) : null}
                {usernameSaved && !editingUsername && (
                  <span className="text-xs text-green-400 flex items-center gap-1"><Check size={10} />저장됨</span>
                )}
              </div>
              {editingUsername && (
                <form onSubmit={saveUsername} className="mt-2">
                  <div className="flex items-center gap-2 rounded-lg bg-theme-surface2 px-3 py-2.5">
                    <span className="text-xs text-theme-subtle">@</span>
                    <input
                      type="text"
                      value={usernameInput}
                      onChange={(e) => setUsernameInput(e.target.value)}
                      autoFocus
                      maxLength={30}
                      placeholder="닉네임 입력"
                      className="flex-1 bg-transparent text-sm text-theme-primary outline-none"
                    />
                    <button type="submit" disabled={savingUsername} className="text-accent disabled:opacity-50">
                      <Check size={16} />
                    </button>
                    <button type="button" onClick={() => { setEditingUsername(false); setUsernameError('') }} className="text-theme-subtle">
                      <X size={16} />
                    </button>
                  </div>
                  {usernameError && <p className="text-[10px] text-red-400 mt-1 px-1">{usernameError}</p>}
                </form>
              )}
            </div>

            {/* 이메일 표시 */}
            <div className="px-4 py-3 flex items-center justify-between">
              <span className="text-xs text-theme-muted">이메일</span>
              <span className="text-xs text-theme-subtle truncate max-w-[200px]">{user?.email}</span>
            </div>
          </div>
        </div>

        {/* 화면 모드 */}
        <div>
          <p className="text-[10px] font-medium uppercase tracking-widest text-theme-muted px-1 mb-2">화면 모드</p>
          <div className="flex items-center justify-between rounded-xl bg-theme-surface px-4 py-3">
            <span className="text-sm text-theme-primary">테마</span>
            <div className="flex items-center gap-1 rounded-lg bg-theme-surface2 p-0.5">
              <button
                onClick={() => handleThemeChange(true)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  isDark ? 'bg-theme-page text-theme-primary shadow-sm' : 'text-theme-muted hover:text-theme-primary'
                }`}
              >
                <Moon size={11} strokeWidth={1.5} />다크
              </button>
              <button
                onClick={() => handleThemeChange(false)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  !isDark ? 'bg-theme-page text-theme-primary shadow-sm' : 'text-theme-muted hover:text-theme-primary'
                }`}
              >
                <Sun size={11} strokeWidth={1.5} />라이트
              </button>
            </div>
          </div>
        </div>

        {/* Lightning 주소 */}
        <div>
          <p className="text-[10px] font-medium uppercase tracking-widest text-theme-muted px-1 mb-2">결제</p>
          <div className="rounded-xl bg-theme-surface px-4 py-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-theme-muted flex items-center gap-1.5">
                <Zap size={11} className="text-accent" />Lightning 주소
              </span>
              {!editingLn ? (
                <button
                  onClick={() => { setEditingLn(true); setLnInput(user?.lightning_address ?? '') }}
                  className={`text-xs font-mono truncate max-w-[180px] ${user?.lightning_address ? 'text-theme-primary hover:text-accent' : 'text-theme-subtle hover:text-accent'} transition-colors`}
                >
                  {user?.lightning_address ?? '탭하여 설정'}
                </button>
              ) : null}
              {lnSaved && !editingLn && (
                <span className="text-xs text-green-400 flex items-center gap-1"><Check size={10} />저장됨</span>
              )}
            </div>
            {editingLn && (
              <form onSubmit={saveLightningAddress} className="mt-2">
                <div className="flex items-center gap-2 rounded-lg bg-theme-surface2 px-3 py-2.5">
                  <Zap size={12} className="text-accent flex-shrink-0" />
                  <input
                    type="text"
                    value={lnInput}
                    onChange={(e) => setLnInput(e.target.value)}
                    placeholder="you@wallet.com"
                    autoFocus
                    className="flex-1 bg-transparent text-sm text-theme-primary outline-none font-mono"
                  />
                  <button type="submit" disabled={saving} className="text-accent disabled:opacity-50">
                    <Check size={16} />
                  </button>
                  <button type="button" onClick={() => setEditingLn(false)} className="text-theme-subtle">
                    <X size={16} />
                  </button>
                </div>
                <p className="text-[10px] text-theme-subtle mt-1 px-1">비트코인 보상 수령에 사용됩니다</p>
              </form>
            )}
          </div>
        </div>

        {/* 약관 + 버전 */}
        <div>
          <p className="text-[10px] font-medium uppercase tracking-widest text-theme-muted px-1 mb-2">정보</p>
          <div className="rounded-xl bg-theme-surface overflow-hidden">
            <button
              onClick={() => navigate('/terms')}
              className="w-full flex items-center justify-between px-4 py-3 text-sm text-theme-primary border-b border-theme-border/50"
            >
              이용약관
              <ChevronLeft size={14} className="rotate-180 text-theme-muted" />
            </button>
            <div className="px-4 py-3 flex items-center justify-between">
              <span className="text-xs text-theme-muted">버전</span>
              <span className="text-xs text-theme-subtle font-mono">v{__APP_VERSION__}</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
