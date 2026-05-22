import { NavLink } from 'react-router-dom'
import { Home, Upload, Bitcoin, User } from 'lucide-react'

const tabs = [
  { to: '/', icon: Home, label: '피드' },
  { to: '/upload', icon: Upload, label: '업로드' },
  { to: '/rewards', icon: Bitcoin, label: '리워드' },
  { to: '/profile', icon: User, label: '프로필' },
]

export default function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex h-16 items-center justify-around border-t border-zinc-800 bg-black/90 backdrop-blur">
      {tabs.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 px-4 py-1 text-xs transition-colors ${
              isActive ? 'text-bitcoin' : 'text-zinc-500'
            }`
          }
        >
          <Icon size={22} strokeWidth={1.5} />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
