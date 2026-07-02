import { useEffect, useState } from 'react'
import { topRoasters, topPosts } from '../services/db.js'
import { colorFromString, initialsFromName } from '../utils.js'
import RoastStars from '../components/RoastStars.jsx'

export default function LeaderboardPage() {
  const [roasters, setRoasters] = useState([])
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    Promise.all([topRoasters(10), topPosts(10)])
      .then(([r, p]) => { if (alive) { setRoasters(r); setPosts(p); setLoading(false) } })
      .catch(err => { console.error(err); if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  return (
    <div className="page">
      <div className="section-h">
        <i className="ti ti-flame"></i> Top Roasters
      </div>
      {loading && <div className="center-state"><i className="ti ti-loader"></i>Loading…</div>}
      {!loading && roasters.length === 0 && (
        <div className="center-state" style={{ padding: '20px' }}>
          <i className="ti ti-trophy"></i>No roasters yet. Write a roast to claim the top!
        </div>
      )}
      {roasters.map((r, i) => (
        <div key={r.userId} className={`leader-row ${i === 0 ? 'top-1' : i === 1 ? 'top-2' : i === 2 ? 'top-3' : ''}`}>
          <div className="leader-rank">{i + 1}</div>
          <div className="av" style={{ background: r.avatarColor || colorFromString(r.userId) }}>
            {initialsFromName(r.username)}
          </div>
          <div className="leader-name">
            {r.username}
            <RoastStars userId={r.userId} total={r.score} compact />
          </div>
          <div className="leader-score"><i className="ti ti-arrow-big-up"></i> {r.score}</div>
        </div>
      ))}

      <div className="section-h" style={{ marginTop: 8 }}>
        <i className="ti ti-trophy"></i> Top Posts
      </div>
      {posts.length === 0 && !loading && (
        <div className="center-state" style={{ padding: '20px' }}>
          <i className="ti ti-photo"></i>No posts yet.
        </div>
      )}
      {posts.map((p, i) => (
        <div key={p.id} className={`leader-row ${i === 0 ? 'top-1' : i === 1 ? 'top-2' : i === 2 ? 'top-3' : ''}`}>
          <div className="leader-rank">{i + 1}</div>
          <div className="av" style={{ background: p.userAvatarColor || colorFromString(p.userId) }}>
            {initialsFromName(p.username)}
          </div>
          <div className="leader-name">{p.caption}</div>
          <div className="leader-score"><i className="ti ti-heart"></i> {p.likes || 0}</div>
        </div>
      ))}
    </div>
  )
}
