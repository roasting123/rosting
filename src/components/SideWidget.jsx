import { useEffect, useState } from 'react'
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import { colorFromString, initialsFromName } from '../utils.js'

/**
 * Right-rail widget for desktop. Shows the top-liked posts.
 * Hidden via CSS on mobile/tablet.
 */
export default function SideWidget() {
  const [posts, setPosts] = useState([])

  useEffect(() => {
    const q = query(collection(db, 'posts'), orderBy('likes', 'desc'), limit(5))
    return onSnapshot(q, snap => {
      setPosts(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
  }, [])

  return (
    <aside className="side-widget">
      <div className="widget-head">
        <i className="ti ti-flame" style={{ color: 'var(--orange)' }}></i>
        Trending now
      </div>
      {posts.length === 0 && (
        <div className="widget-empty">No posts yet.</div>
      )}
      {posts.map((p, i) => (
        <div key={p.id} className="widget-row">
          <div className="widget-rank">{i + 1}</div>
          <div className="av" style={{ background: p.userAvatarColor || colorFromString(p.userId) }}>
            {initialsFromName(p.username)}
          </div>
          <div className="widget-meta">
            <div className="widget-title">{p.caption}</div>
            <div className="widget-sub">
              <span><i className="ti ti-heart"></i> {p.likes || 0}</span>
              <span><i className="ti ti-message-circle"></i> {p.roastCount || 0}</span>
            </div>
          </div>
        </div>
      ))}
    </aside>
  )
}
