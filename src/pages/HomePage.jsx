import { useEffect, useState } from 'react'
import { subscribeFeed } from '../services/db.js'
import FilterChips from '../components/FilterChips.jsx'
import PostCard from '../components/PostCard.jsx'
import { useNavigate } from 'react-router-dom'

const FILTERS = ['Trending', 'New', 'Most roasted', 'Following', '#gymfail', '#viral']

export default function HomePage() {
  const [filter, setFilter] = useState('Trending')
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const nav = useNavigate()

  useEffect(() => {
    setLoading(true)
    const unsub = subscribeFeed(filter, (p) => {
      setPosts(p); setLoading(false)
    })
    return unsub
  }, [filter])

  return (
    <div className="page">
      <FilterChips options={FILTERS} value={filter} onChange={setFilter} />

      <div className="feed">
        {loading && (
          <div className="center-state">
            <i className="ti ti-loader"></i>Loading feed…
          </div>
        )}
        {!loading && posts.length === 0 && (
          <div className="center-state">
            <i className="ti ti-mood-empty"></i>
            No posts yet — be the first to roast! 🔥
          </div>
        )}
        {posts.map(p => <PostCard key={p.id} post={p} feed={posts} />)}

        {posts.length > 0 && (
          <div className="nudge">
            <div className="nudge-emoji">🔥</div>
            <div className="nudge-title">Ab teri baari</div>
            <div className="nudge-sub">Apni pic daal — community se savage roast le</div>
            <button className="nudge-btn" onClick={() => nav('/upload')}>
              Upload a pic ↗
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
