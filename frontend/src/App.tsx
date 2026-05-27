import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuthStore } from './store/auth'
import client from './api/client'
import type { User } from './api/types'
import BottomNav from './components/BottomNav'
import { isFlutterWebView } from './lib/platform'
import FeedPage from './pages/FeedPage'
import LoginPage from './pages/LoginPage'
import UploadPage from './pages/UploadPage'
import RewardsPage from './pages/RewardsPage'
import ChallengePage from './pages/ChallengePage'
import ChallengeCreatePage from './pages/ChallengeCreatePage'
import ProfilePage from './pages/ProfilePage'
import AdminPage from './pages/AdminPage'
import TermsPage from './pages/TermsPage'
import TeamPage from './pages/TeamPage'
import UserProfilePage from './pages/UserProfilePage'
import SetupUsernamePage from './pages/SetupUsernamePage'
import MyChallengeDashboardPage from './pages/MyChallengeDashboardPage'
import ChallengeDashboardPage from './pages/ChallengeDashboardPage'
import ChallengeDetailPage from './pages/ChallengeDetailPage'
import SettingsPage from './pages/SettingsPage'
import LeaderboardPage from './pages/LeaderboardPage'
import SharedVideoPage from './pages/SharedVideoPage'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token)
  return token ? <>{children}</> : <Navigate to="/login" replace />
}

const HIDE_NAV = ['/login', '/admin', '/terms', '/team', '/setup-username']

function Layout() {
  const location = useLocation()
  const { pathname } = location
  const hideNav = HIDE_NAV.includes(pathname)
  const navigate = useNavigate()
  const login = useAuthStore((s) => s.login)
  const { token, setUser } = useAuthStore()

  // 앱 시작 시 저장된 토큰으로 유저 정보 최신화 (is_admin 등 DB 변경사항 반영)
  useEffect(() => {
    if (!token) return
    client
      .get<{ data: User }>('/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => setUser(res.data.data))
      .catch(() => undefined)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const googleToken = params.get('google_token')
    if (!googleToken) return
    const isNew = params.get('new_user') === '1'
    if (isNew) {
      window.history.replaceState({}, '', '/')
      navigate(`/setup-username?token=${encodeURIComponent(googleToken)}`, { replace: true })
      return
    }
    client
      .get<{ data: User }>('/auth/me', {
        headers: { Authorization: `Bearer ${googleToken}` },
      })
      .then((res) => {
        login(googleToken, res.data.data)
        window.history.replaceState({}, '', '/')
        navigate('/', { replace: true })
      })
      .catch(() => {
        window.history.replaceState({}, '', '/login?error=google_auth_failed')
        navigate('/login?error=google_auth_failed', { replace: true })
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isFlutter = isFlutterWebView()

  return (
    <div className="relative h-full">
      <div key={location.key} className="absolute inset-0 page-enter">
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/share/:postId" element={<SharedVideoPage />} />
        <Route path="/" element={<RequireAuth><FeedPage /></RequireAuth>} />
        <Route
          path="/upload"
          element={
            <RequireAuth>
              <UploadPage />
            </RequireAuth>
          }
        />
        <Route
          path="/rewards"
          element={
            <RequireAuth>
              <RewardsPage />
            </RequireAuth>
          }
        />
        <Route path="/challenges" element={<ChallengePage />} />
        <Route path="/challenges/create" element={<ChallengeCreatePage />} />
        <Route path="/challenges/:id" element={<ChallengeDetailPage />} />
        <Route path="/my-challenges" element={<RequireAuth><MyChallengeDashboardPage /></RequireAuth>} />
        <Route path="/challenges/:id/dashboard" element={<RequireAuth><ChallengeDashboardPage /></RequireAuth>} />
        <Route
          path="/profile"
          element={
            <RequireAuth>
              <ProfilePage />
            </RequireAuth>
          }
        />
        <Route path="/setup-username" element={<SetupUsernamePage />} />
        <Route path="/users/:userId" element={<UserProfilePage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/settings" element={<RequireAuth><SettingsPage /></RequireAuth>} />
        <Route path="/team" element={<TeamPage />} />
        <Route path="/leaderboard" element={<LeaderboardPage />} />
      </Routes>
      </div>
      {!hideNav && !isFlutter && <BottomNav />}
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Layout />
    </BrowserRouter>
  )
}
