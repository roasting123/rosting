import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { searchUsers } from '../services/db.js'
import { colorFromString, initialsFromName } from '../utils.js'
import { useAuth } from '../context/AuthContext.jsx'
import RoastStars from '../components/RoastStars.jsx'

export default function SearchPage() {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const initialQ = params.get('q') || ''
  const [query, setQuery] = useState(initialQ)
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const debounceRef = useRef(null)
  const inputRef = useRef(null)
  const nav = useNavigate()

  // Focus the search box on mount.
  useEffect(() => { inputRef.current?.focus() }, [])

  // Debounced live search.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const q = query.trim()
    if (!q) {
      setResults([])
      setSearched(false)
      return
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const r = await searchUsers(q, 25)
        setResults(r)
        setSearched(true)
        // Reflect the term in the URL so it's shareable.
        setParams({ q }, { replace: true })
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[RoastBoard] search failed:', e)
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 220)
    return () => debounceRef.current && clearTimeout(debounceRef.current)
  }, [query]) // eslint-disable-line react-hooks/exhaustive-deps

  const onSubmit = (e) => {
    e.preventDefault()
    // Already debounced — just flush by setting query to itself (no-op).
  }

  const openUser = (u) => {
    // Always navigate to the public profile route. ProfilePage detects
    // whether the viewed uid matches the signed-in user and renders the
    // owner UI (Edit / Sign out) accordingly.
    nav(`/u/${u.id}`)
  }

  return (
    <div className="page">
      <div className="page-header">
        <button className="page-back" onClick={() => nav(-1)} aria-label="back">
          <i className="ti ti-arrow-left"></i>
        </button>
        <h2 className="page-title">Find people</h2>
      </div>

      <form className="search-bar" onSubmit={onSubmit}>
        <i className="ti ti-search"></i>
        <input
          ref={inputRef}
          type="text"
          className="search-input"
          placeholder="Search by username…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          autoComplete="off"
          spellCheck="false"
        />
        {query && (
          <button
            type="button"
            className="search-clear"
            onClick={() => { setQuery(''); inputRef.current?.focus() }}
            aria-label="clear"
          >
            <i className="ti ti-x"></i>
          </button>
        )}
      </form>

      <div className="search-hint">
        {loading && <>Searching…</>}
        {!loading && !query && <>Type a username to find roasters. Try your own name first.</>}
        {!loading && searched && query && results.length === 0 && (
          <>No users match "<b>{query}</b>".</>
        )}
        {!loading && results.length > 0 && (
          <>{results.length} {results.length === 1 ? 'result' : 'results'}</>
        )}
      </div>

      <div className="search-results">
        {results.map(u => (
          <div
            key={u.id}
            className="user-row search-row"
            role="button"
            tabIndex={0}
            onClick={() => openUser(u)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                openUser(u)
              }
            }}
          >
            <div
              className="av"
              style={{ background: u.avatarColor || colorFromString(u.id), width: 40, height: 40, fontSize: 13 }}
            >
              {initialsFromName(u.username)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="username" style={{ fontSize: 14 }}>
                  {u.username}
                </span>
                {u.verified && <span className="vbadge">✓</span>}
                <RoastStars userId={u.id} total={u.roastScoreTotal || 0} compact />
                {u.id === user?.uid && (
                  <span style={{
                    fontSize: 9, padding: '1px 6px', borderRadius: 8,
                    background: 'var(--orange-soft)', color: 'var(--orange-2)',
                    fontWeight: 500
                  }}>YOU</span>
                )}
              </div>
              {u.displayName && u.displayName !== u.username && (
                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{u.displayName}</div>
              )}
              {u.bio && (
                <div style={{
                  fontSize: 12, color: 'var(--text-dim)', marginTop: 4, lineHeight: 1.4,
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden'
                }}>{u.bio}</div>
              )}
            </div>
            <button
              className="qa-btn qa-share"
              onClick={(e) => { e.stopPropagation(); openUser(u) }}
              style={{ marginLeft: 'auto' }}
            >
              <i className="ti ti-arrow-up-right"></i>
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
