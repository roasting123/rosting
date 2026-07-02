import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuth } from './context/AuthContext.jsx'

import TopBar from './components/TopBar.jsx'
import BottomNav from './components/BottomNav.jsx'
import SideNav from './components/SideNav.jsx'
import SideWidget from './components/SideWidget.jsx'

import HomePage from './pages/HomePage.jsx'
import ExplorePage from './pages/ExplorePage.jsx'
import LeaderboardPage from './pages/LeaderboardPage.jsx'
import ProfilePage from './pages/ProfilePage.jsx'
import ProfileEditPage from './pages/ProfileEditPage.jsx'
import UploadPage from './pages/UploadPage.jsx'
import AuthPage from './pages/AuthPage.jsx'
import SearchPage from './pages/SearchPage.jsx'
import PostReader from './components/PostReader.jsx'

function MobileShell({ children, showTop = true }) {
  return (
    <div className="app-shell mobile-shell">
      {showTop && <TopBar />}
      {children}
      <BottomNav />
    </div>
  )
}

function DesktopShell({ children }) {
  // 3-column: [side nav] [feed] [widget]
  return (
    <div className="desktop-shell">
      <SideNav />
      <main className="desktop-feed">
        {children}
      </main>
      <SideWidget />
    </div>
  )
}

function ResponsiveShell({ children, showTop = true }) {
  // JS breakpoint (not CSS-only) so we can mount different chrome on desktop.
  // Threshold matches the @media (min-width: 1024px) rule in global.css.
  const [isDesktop, setIsDesktop] = useState(
    typeof window !== 'undefined' && window.matchMedia?.('(min-width: 1024px)').matches
  )
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const onChange = (e) => setIsDesktop(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return isDesktop
    ? <DesktopShell>{children}</DesktopShell>
    : <MobileShell showTop={showTop}>{children}</MobileShell>
}

function RequireAuth({ children }) {
  const { user, loading } = useAuth()
  const loc = useLocation()
  if (loading) return (
    <div className="app-shell">
      <div className="center-state"><i className="ti ti-loader"></i>Loading…</div>
    </div>
  )
  if (!user) return <Navigate to="/auth" replace state={{ from: loc }} />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/"          element={<ResponsiveShell><HomePage /></ResponsiveShell>} />
      <Route path="/explore"   element={<ResponsiveShell><ExplorePage /></ResponsiveShell>} />
      <Route path="/leaderboard" element={<ResponsiveShell><LeaderboardPage /></ResponsiveShell>} />
      <Route path="/search"   element={<ResponsiveShell><SearchPage /></ResponsiveShell>} />
      <Route path="/profile"   element={<ResponsiveShell><ProfilePage /></ResponsiveShell>} />
      <Route path="/u/:uid"    element={<ResponsiveShell><ProfilePage /></ResponsiveShell>} />
      <Route path="/profile/edit" element={<ResponsiveShell><RequireAuth><ProfileEditPage /></RequireAuth></ResponsiveShell>} />
      <Route path="/upload"    element={<ResponsiveShell showTop={false}><RequireAuth><UploadPage /></RequireAuth></ResponsiveShell>} />
      {/* Post reader is a full-screen modal — no shell chrome. */}
      <Route path="/post/:postId" element={<PostReader />} />
      <Route path="*"          element={<Navigate to="/" replace />} />
    </Routes>
  )
}
