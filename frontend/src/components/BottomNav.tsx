import { NavLink, useNavigate } from 'react-router-dom'
import { Home, Plus, User } from 'lucide-react'
import { useAuthStore } from '../store/auth'

const tabs = [
  { to: '/', icon: Home, label: '피드' },
  { to: '/profile', icon: User, label: '프로필' },
]

export default function BottomNav() {
  const navigate = useNavigate()
  const token = useAuthStore((s) => s.token)

  function handleUpload() {
    if (token) {
      navigate('/upload')
    } else {
      navigate('/login')
    }
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 h-16 border-t border-theme-border bg-theme-surface">
      <div className="flex h-full items-center justify-around">
        <NavLink
          to={tabs[0].to}
          end
          className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 px-4 py-1 text-xs transition-colors ${
              isActive ? 'text-accent-text' : 'text-theme-subtle'
            }`
          }
        >
          <Home size={22} strokeWidth={1.5} />
          <span>피드</span>
        </NavLink>

        {/* FAB — overlaps tab bar */}
        <div className="relative flex flex-col items-center">
          <button
            onClick={handleUpload}
            className="absolute -top-7 flex h-14 w-14 items-center justify-center rounded-full bg-accent shadow-lg transition-transform active:scale-95"
            aria-label="운동 영상 올리기"
          >
            <Plus size={24} strokeWidth={2} color="var(--accent-fg)" />
          </button>
          <span className="mt-1 text-xs text-transparent select-none">업로드</span>
        </div>

        <NavLink
          to={tabs[1].to}
          className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 px-4 py-1 text-xs transition-colors ${
              isActive ? 'text-accent-text' : 'text-theme-subtle'
            }`
          }
        >
          <User size={22} strokeWidth={1.5} />
          <span>프로필</span>
        </NavLink>
      </div>
    </nav>
  )
}
