import { NavLink, useNavigate } from 'react-router-dom'
import { Home, Plus, UserCircle, Users, Dumbbell } from 'lucide-react'
import { useAuthStore } from '../store/auth'

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

  const navItem = ({ isActive }: { isActive: boolean }) =>
    `flex flex-col items-center gap-0.5 px-3 py-1 text-xs transition-colors ${
      isActive ? 'text-accent-text' : 'text-theme-subtle'
    }`

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-theme-border bg-theme-surface pb-safe" style={{ transform: 'translateZ(0)' }}>
      <div className="flex h-16 items-center justify-around">
        {/* 피드 */}
        <NavLink to="/" end className={navItem}>
          <Home size={22} strokeWidth={1.5} />
          <span>피드</span>
        </NavLink>

        {/* 챌린지 */}
        <NavLink to="/challenges" className={navItem}>
          <Dumbbell size={22} strokeWidth={1.5} />
          <span>챌린지</span>
        </NavLink>

        {/* FAB — 업로드 */}
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

        {/* 사용자 */}
        <NavLink to="/leaderboard" className={navItem}>
          <Users size={22} strokeWidth={1.5} />
          <span>사용자</span>
        </NavLink>

        {/* 프로필 */}
        <NavLink to="/profile" className={navItem}>
          <UserCircle size={22} strokeWidth={1.5} />
          <span>프로필</span>
        </NavLink>
      </div>
    </nav>
  )
}
