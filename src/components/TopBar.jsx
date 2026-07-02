import NotifBell from './NotifBell.jsx'
import { useNavigate } from 'react-router-dom'

export default function TopBar() {
  const nav = useNavigate()
  return (
    <div className="top-bar">
      <div className="logo">
        <div className="logo-dot">🔥</div>
        RoastBoard
      </div>
      <div className="top-right">
        <button
          className="icon-btn"
          aria-label="search"
          onClick={() => nav('/search')}
        >
          <i className="ti ti-search"></i>
        </button>
        <NotifBell />
      </div>
    </div>
  )
}
