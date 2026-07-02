import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import {
  subscribeNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  clearAllNotifications
} from '../notifications'
import { timeAgo } from '../utils'

// Small visual hint next to icons that means "this action triggers a
// notification for the recipient." Used in the dropdown rows.
const ICON_FOR = {
  like:  { i: 'ti-heart',          color: '#ff5050' },
  fire:  { i: 'ti-flame',          color: '#ff4d00' },
  roast: { i: 'ti-message-circle', color: '#5b8fff' },
  upvote:{ i: 'ti-arrow-big-up',   color: '#ff7a40' },
  follow:{ i: 'ti-user-plus',      color: '#3ecf3e' }
}

export default function NotifBell() {
  const { user } = useAuth()
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!user) return setItems([])
    return subscribeNotifications(user.uid, setItems)
  }, [user])

  // Close on outside click / escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const unread = items.filter(n => !n.read).length

  const handleOpen = async () => {
    setOpen(o => !o)
    if (!open && unread > 0 && user) {
      // Mark everything read shortly after the user sees them.
      setTimeout(() => markAllNotificationsRead(user.uid), 1200)
    }
  }

  if (!user) {
    // Hide the bell entirely for signed-out users.
    return null
  }

  return (
    <div ref={wrapRef} className="notif-wrap">
      <button
        className={`icon-btn notif-dot ${unread > 0 ? 'has-unread' : ''}`}
        aria-label="notifications"
        onClick={handleOpen}
      >
        <i className="ti ti-bell"></i>
      </button>

      {open && (
        <div className="notif-panel" role="dialog" aria-label="Notifications">
          <div className="notif-head">
            <span>Notifications</span>
            {items.length > 0 && (
              <button
                className="notif-clear"
                onClick={() => clearAllNotifications(user.uid)}
              >Clear all</button>
            )}
          </div>

          <div className="notif-list">
            {items.length === 0 && (
              <div className="notif-empty">
                <i className="ti ti-bell-off"></i>
                No notifications yet
              </div>
            )}
            {items.map(n => {
              const meta = ICON_FOR[n.type] || ICON_FOR.roast
              return (
                <div
                  key={n.id}
                  className={`notif-item ${n.read ? '' : 'unread'}`}
                  onClick={() => markNotificationRead(user.uid, n.id)}
                >
                  <div className="notif-icon" style={{ color: meta.color }}>
                    <i className={`ti ${meta.i}`}></i>
                  </div>
                  <div className="notif-body">
                    <div className="notif-title">{n.title || 'New activity'}</div>
                    {n.body && <div className="notif-text">{n.body}</div>}
                    <div className="notif-time">{timeAgo(n.createdAt)}</div>
                  </div>
                  {!n.read && <div className="notif-dot-mini" />}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
