import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from './store/auth'
import BottomNav from './components/BottomNav'
import FeedPage from './pages/FeedPage'
import LoginPage from './pages/LoginPage'
import UploadPage from './pages/UploadPage'
import RewardsPage from './pages/RewardsPage'
import ChallengePage from './pages/ChallengePage'
import ProfilePage from './pages/ProfilePage'
import AdminPage from './pages/AdminPage'
import TermsPage from './pages/TermsPage'
import HistoryPage from './pages/HistoryPage'
import TeamPage from './pages/TeamPage'
import UserProfilePage from './pages/UserProfilePage'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token)
  return token ? <>{children}</> : <Navigate to="/login" replace />
}

const HIDE_NAV = ['/login', '/admin', '/terms', '/team']

function Layout() {
  const { pathname } = useLocation()
  const hideNav = HIDE_NAV.includes(pathname)
  return (
    <div className="relative h-full">
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<FeedPage />} />
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
        <Route
          path="/profile"
          element={
            <RequireAuth>
              <ProfilePage />
            </RequireAuth>
          }
        />
        <Route
          path="/history"
          element={
            <RequireAuth>
              <HistoryPage />
            </RequireAuth>
          }
        />
        <Route path="/users/:userId" element={<UserProfilePage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/team" element={<TeamPage />} />
      </Routes>
      {!hideNav && <BottomNav />}
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
