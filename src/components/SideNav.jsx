import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { colorFromString, initialsFromName } from '../utils.js'

const items = [
  { to: '/',            icon: 'ti-home',     label: 'Home' },
  { to: '/explore',     icon: 'ti-compass',  label: 'Explore' },
  { to: '/upload',      icon: 'ti-plus',     label: 'Upload' },
  { to: '/leaderboard', icon: 'ti-trophy',   label: 'Leaders' },
  { to: '/search',      icon: 'ti-search',   label: 'Search' },
  { to: '/profile',     icon: 'ti-user',     label: 'Profile' }
]

export default function SideNav() {
  const { user, profile } = useAuth()
  const avColor = profile?.avatarColor || colorFromString(user?.uid || 'guest')
  const avInit  = initialsFromName(profile?.username || user?.displayName || '?')

  return (
    <aside className="side-nav">
      <div className="side-brand">
        <div className="logo-dot">🔥</div>
        <span>RoastBoard</span>
      </div>

      {user && (
        <NavLink to="/profile" className="side-user">
          <div className="side-av" style={{ background: avColor }}>{avInit}</div>
          <div className="side-user-meta">
            <div className="side-user-name">{profile?.username || user.displayName || 'you'}</div>
            <div className="side-user-handle">@{profile?.username || user.email?.split('@')[0]}</div>
          </div>
        </NavLink>
      )}

      <nav className="side-list">
        {items.map(it => (
          <NavLink
            key={it.to}
            to={it.to}
            end={it.to === '/'}
            className={({ isActive }) => `side-link ${isActive ? 'on' : ''}`}
          >
            <i className={`ti ${it.icon}`}></i>
            <span>{it.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="side-foot">
        <span>RoastBoard · 2026</span>
      </div>
    </aside>
  )
}
