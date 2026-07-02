import { NavLink } from 'react-router-dom'

const tabs = [
  { to: '/',          icon: 'ti-home',     label: 'Home' },
  { to: '/explore',   icon: 'ti-compass',  label: 'Explore' },
  { to: '/upload',    icon: 'ti-plus',     label: '', center: true },
  { to: '/leaderboard', icon: 'ti-trophy', label: 'Leaders' },
  { to: '/search',    icon: 'ti-search',   label: 'Search' },
  { to: '/profile',   icon: 'ti-user',     label: 'Profile' }
]

export default function BottomNav() {
  return (
    <nav className="bottom-nav">
      {tabs.map(t => t.center ? (
        <NavLink key={t.to} to={t.to} className="bnav-center">
          <div className="plus-btn"><i className={`ti ${t.icon}`}></i></div>
        </NavLink>
      ) : (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.to === '/'}
          className={({ isActive }) => `bnav ${isActive ? 'on' : ''}`}
        >
          <i className={`ti ${t.icon}`}></i>
          <span>{t.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
