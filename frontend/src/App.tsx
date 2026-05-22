import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/auth'
import BottomNav from './components/BottomNav'
import FeedPage from './pages/FeedPage'
import LoginPage from './pages/LoginPage'
import UploadPage from './pages/UploadPage'
import RewardsPage from './pages/RewardsPage'
import ProfilePage from './pages/ProfilePage'
import AdminPage from './pages/AdminPage'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token)
  return token ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <BrowserRouter>
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
          <Route
            path="/profile"
            element={
              <RequireAuth>
                <ProfilePage />
              </RequireAuth>
            }
          />
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
        <BottomNav />
      </div>
    </BrowserRouter>
  )
}
