import { useEffect, useState } from 'react'
import { subscribeFeed } from '../services/db.js'
import FilterChips from '../components/FilterChips.jsx'
import PostCard from '../components/PostCard.jsx'

const FILTERS = ['Trending', 'New', 'Most roasted', 'Following', '#gymfail', '#viral']

export default function ExplorePage() {
  const [filter, setFilter] = useState('Trending')
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const unsub = subscribeFeed(filter, (p) => { setPosts(p); setLoading(false) })
    return unsub
  }, [filter])

  return (
    <div className="page">
      <FilterChips options={FILTERS} value={filter} onChange={setFilter} />
      <div className="feed">
        {loading && <div className="center-state"><i className="ti ti-loader"></i>Loading…</div>}
        {!loading && posts.length === 0 && (
          <div className="center-state">
            <i className="ti ti-search"></i>Nothing in this category yet.
          </div>
        )}
        {posts.map(p => <PostCard key={p.id} post={p} feed={posts} />)}
      </div>
    </div>
  )
}
