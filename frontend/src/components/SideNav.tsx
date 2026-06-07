import { NavLink, useNavigate } from 'react-router-dom'
import { Home, Plus, UserCircle, Users, Dumbbell } from 'lucide-react'
import { useAuthStore } from '../store/auth'
import LogoMark from './LogoMark'

export default function SideNav() {
  const navigate = useNavigate()
  const token = useAuthStore((s) => s.token)

  function handleUpload() {
    navigate(token ? '/upload' : '/login')
  }

  const navItem = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors ${
      isActive
        ? 'bg-theme-surface2 text-accent-text'
        : 'text-theme-subtle hover:bg-theme-surface2 hover:text-theme-primary'
    }`

  return (
    <nav className="fixed left-0 top-0 z-50 hidden h-full w-60 flex-col border-r border-theme-border bg-theme-surface lg:flex">
      {/* 로고 */}
      <div className="flex items-center gap-2 px-6 py-5">
        <LogoMark size={28} className="text-accent" />
        <span className="text-base font-bold text-theme-primary">Stack Health</span>
      </div>

      {/* 네비게이션 항목 */}
      <div className="flex flex-1 flex-col gap-1 px-3">
        <NavLink to="/" end className={navItem}>
          <Home size={20} strokeWidth={1.5} />
          <span>피드</span>
        </NavLink>

        <NavLink to="/challenges" className={navItem}>
          <Dumbbell size={20} strokeWidth={1.5} />
          <span>챌린지</span>
        </NavLink>

        <button
          onClick={handleUpload}
          className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-theme-subtle transition-colors hover:bg-theme-surface2 hover:text-theme-primary"
        >
          <Plus size={20} strokeWidth={1.5} />
          <span>업로드</span>
        </button>

        <NavLink to="/leaderboard" className={navItem}>
          <Users size={20} strokeWidth={1.5} />
          <span>사용자</span>
        </NavLink>

        <NavLink to="/profile" className={navItem}>
          <UserCircle size={20} strokeWidth={1.5} />
          <span>프로필</span>
        </NavLink>
      </div>
    </nav>
  )
}
