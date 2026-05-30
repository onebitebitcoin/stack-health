import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, lazy, Suspense } from 'react'
import { useAuthStore } from './store/auth'
import client from './api/client'
import type { User } from './api/types'
import { useVersionCheck } from './hooks/useVersionCheck'
import UpdateBanner from './components/UpdateBanner'
import BottomNav from './components/BottomNav'
import SideNav from './components/SideNav'
import LoadingScreen from './components/LoadingScreen'
import { isFlutterWebView } from './lib/platform'

// 초기 번들에 포함 (첫 화면)
import FeedPage from './pages/FeedPage'
import LoginPage from './pages/LoginPage'

// 나머지는 lazy load
const UploadPage = lazy(() => import('./pages/UploadPage'))
const ChallengePage = lazy(() => import('./pages/ChallengePage'))
const ChallengeCreatePage = lazy(() => import('./pages/ChallengeCreatePage'))
const ProfilePage = lazy(() => import('./pages/ProfilePage'))
const AdminPage = lazy(() => import('./pages/AdminPage'))
const TermsPage = lazy(() => import('./pages/TermsPage'))
const TeamPage = lazy(() => import('./pages/TeamPage'))
const UserProfilePage = lazy(() => import('./pages/UserProfilePage'))
const SetupUsernamePage = lazy(() => import('./pages/SetupUsernamePage'))
const MyChallengeDashboardPage = lazy(() => import('./pages/MyChallengeDashboardPage'))
const ChallengeDashboardPage = lazy(() => import('./pages/ChallengeDashboardPage'))
const ChallengeDetailPage = lazy(() => import('./pages/ChallengeDetailPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const LeaderboardPage = lazy(() => import('./pages/LeaderboardPage'))
const SharedVideoPage = lazy(() => import('./pages/SharedVideoPage'))
const LightningLoginPage = lazy(() => import('./pages/LightningLoginPage'))
const EmailLoginPage = lazy(() => import('./pages/EmailLoginPage'))
const RegisterPage = lazy(() => import('./pages/RegisterPage'))

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token)
  return token ? <>{children}</> : <Navigate to="/login" replace />
}

const HIDE_NAV = ['/login', '/login/lightning', '/login/email', '/login/register', '/admin', '/terms', '/team', '/setup-username']
const KNOWN_ROUTE_SEGMENTS = new Set([
  'login', 'upload', 'challenges', 'my-challenges',
  'profile', 'setup-username', 'users', 'admin', 'terms',
  'settings', 'team', 'leaderboard', 'share', 'register',
])

function Layout() {
  const location = useLocation()
  const { pathname } = location
  const segments = pathname.split('/').filter(Boolean)
  const isShareRoute = segments.length === 1 && !KNOWN_ROUTE_SEGMENTS.has(segments[0])
  const hideNav = HIDE_NAV.includes(pathname) || isShareRoute
  const navigate = useNavigate()
  const login = useAuthStore((s) => s.login)
  const { token, setUser } = useAuthStore()

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
    const hash = location.hash.slice(1)
    const params = new URLSearchParams(hash)
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
  const { updateAvailable, serverVersion } = useVersionCheck()

  const showNav = !hideNav && !isFlutter

  return (
    <div className="relative h-full">
      {showNav && <SideNav />}
      {updateAvailable && !isFlutter && <UpdateBanner serverVersion={serverVersion} />}
      <div key={location.key} className={`absolute inset-0 page-enter${showNav ? ' lg:left-60' : ''}`}>
      <Suspense fallback={<LoadingScreen />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/login/lightning" element={<LightningLoginPage />} />
        <Route path="/login/email" element={<EmailLoginPage />} />
        <Route path="/login/register" element={<RegisterPage />} />
        <Route path="/" element={<RequireAuth><FeedPage /></RequireAuth>} />
        <Route path="/upload" element={<RequireAuth><UploadPage /></RequireAuth>} />
        <Route path="/challenges" element={<ChallengePage />} />
        <Route path="/challenges/create" element={<ChallengeCreatePage />} />
        <Route path="/challenges/:id" element={<ChallengeDetailPage />} />
        <Route path="/my-challenges" element={<RequireAuth><MyChallengeDashboardPage /></RequireAuth>} />
        <Route path="/challenges/:id/dashboard" element={<RequireAuth><ChallengeDashboardPage /></RequireAuth>} />
        <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
        <Route path="/setup-username" element={<SetupUsernamePage />} />
        <Route path="/users/:userId" element={<UserProfilePage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/settings" element={<RequireAuth><SettingsPage /></RequireAuth>} />
        <Route path="/team" element={<TeamPage />} />
        <Route path="/leaderboard" element={<LeaderboardPage />} />
        <Route path="/shorts/:shareToken" element={<SharedVideoPage />} />
      </Routes>
      </Suspense>
      </div>
      {showNav && <BottomNav />}
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
