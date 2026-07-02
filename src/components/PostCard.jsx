import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { useNavigate } from 'react-router-dom'
import {
  subscribeRoasts, addRoast, toggleRoastUpvote, toggleRoastLaugh, toggleLike, subscribeLikedSet,
  subscribeReplies, addReply, deleteReply
} from '../services/db.js'
import { timeAgo, colorFromString, initialsFromName, emojiForPost } from '../utils.js'
import LoginModal from './LoginModal.jsx'
import RoastThread from './RoastThread.jsx'

/**
 * Compute the rank badge for a post based on its position in the visible feed.
 * Server-side ranking (via a Cloud Function) is the production approach, but
 * we also compute a client-side rank on the fly so badges are always fresh.
 */
function rankFor(post, feed) {
  if (!post?.createdAt) return { kind: 'new', label: 'New' }
  const created = post.createdAt.toDate ? post.createdAt.toDate() : new Date(post.createdAt)
  const now = new Date()
  const hours = (now - created) / 36e5
  const likes = post.likes || 0
  const fires = post.fireCount || 0
  const score = likes + fires * 2

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const weekStart  = new Date(); weekStart.setDate(weekStart.getDate() - 7)

  const todays = feed.filter(p => p.createdAt?.toDate?.() >= todayStart)
  const weeks  = feed.filter(p => {
    const d = p.createdAt?.toDate?.(); return d && d >= weekStart
  })

  const sortedToday = [...todays].sort((a, b) =>
    ((b.likes || 0) + (b.fireCount || 0) * 2) - ((a.likes || 0) + (a.fireCount || 0) * 2))
  const sortedWeek  = [...weeks].sort((a, b) =>
    ((b.likes || 0) + (b.fireCount || 0) * 2) - ((a.likes || 0) + (a.fireCount || 0) * 2))

  if (sortedToday[0]?.id === post.id && likes > 0) {
    return { kind: 1, label: '#1 today', cls: 'rank-1', icon: 'ti-flame' }
  }
  if (sortedWeek[0]?.id === post.id && likes > 0) {
    return { kind: 2, label: '#1 this week', cls: 'rank-2', icon: 'ti-crown' }
  }
  if (sortedWeek[1]?.id === post.id && likes > 0) {
    return { kind: 2, label: '#2 this week', cls: 'rank-2', icon: 'ti-crown' }
  }
  if (hours < 6 && score > 20) {
    return { kind: 'v', label: 'Going viral', cls: 'rank-new', icon: 'ti-trending-up' }
  }
  return { kind: 'new', label: 'New', cls: 'rank-new', icon: 'ti-sparkles' }
}

/**
 * Full-screen reader modal that opens when a roast is clicked.
 * Rendered inline by PostCard — no router involvement, just state.
 */
function PostReaderModal({ post, initialFocusId, onClose, onLogin }) {
  const { user, profile } = useAuth()
  const nav = useNavigate()
  const [roasts, setRoasts] = useState([])
  const [voted, setVoted] = useState(new Set())
  const [laughed, setLaughed] = useState(new Set())
  const [replies, setReplies] = useState({}) // { [roastId]: Reply[] }
  const [replyOpenId, setReplyOpenId] = useState(null)
  const [replyDraft, setReplyDraft] = useState('')
  const [posting, setPosting] = useState(false)
  const [draft, setDraft] = useState('')
  const focusedRef = useRef(null)
  const listRef = useRef(null)

  useEffect(() => {
    if (!post?.id) return
    return subscribeRoasts(post.id, setRoasts)
  }, [post?.id])

  // Live replies per roast.
  useEffect(() => {
    if (!post?.id || !roasts.length) return
    const unsubs = roasts.map(r =>
      subscribeReplies(post.id, r.id, list => {
        setReplies(prev => ({ ...prev, [r.id]: list }))
      })
    )
    return () => unsubs.forEach(u => u && u())
  }, [post?.id, roasts])

  // When initialFocusId is set (came from clicking a specific roast), scroll
  // to it and flash.
  useEffect(() => {
    if (!initialFocusId || !roasts.length) return
    requestAnimationFrame(() => {
      const el = focusedRef.current
      if (!el) return
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add('flash')
      setTimeout(() => el.classList.remove('flash'), 1800)
    })
  }, [initialFocusId, roasts])

  // Esc to close
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Lock body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const handleUpvote = async (roastId) => {
    if (!user) return onLogin()
    try {
      await toggleRoastUpvote(post.id, roastId, user.uid)
      setVoted(s => {
        const n = new Set(s)
        n.has(roastId) ? n.delete(roastId) : n.add(roastId)
        return n
      })
    } catch (e) { console.error(e) }
  }

  const handleLaugh = async (roastId) => {
    if (!user) return onLogin()
    try {
      await toggleRoastLaugh(post.id, roastId, user.uid)
      setLaughed(s => {
        const n = new Set(s)
        n.has(roastId) ? n.delete(roastId) : n.add(roastId)
        return n
      })
    } catch (e) { console.error(e) }
  }

  const handleWrite = async (text) => {
    if (!user) return onLogin()
    setPosting(true)
    try {
      await addRoast(post.id, {
        text,
        userId: user.uid,
        username: profile?.username || user.displayName || user.email?.split('@')[0],
        userAvatarColor: profile?.avatarColor || colorFromString(user.uid)
      })
      setDraft('')
    } catch (e) { console.error(e) }
    finally { setPosting(false) }
  }

  const handleWriteReply = async (roastId, text) => {
    if (!user) return onLogin()
    try {
      await addReply(post.id, roastId, {
        text,
        userId: user.uid,
        username: profile?.username || user.displayName || user.email?.split('@')[0],
        userAvatarColor: profile?.avatarColor || colorFromString(user.uid)
      })
      setReplyDraft('')
      setReplyOpenId(null)
    } catch (e) { console.error(e) }
  }

  const handleDeleteReply = async (roastId, replyId) => {
    if (!user) return
    try {
      await deleteReply(post.id, roastId, replyId, user.uid)
    } catch (e) { console.error(e) }
  }

  const toggleReply = (roastId) => {
    setReplyOpenId(prev => prev === roastId ? null : roastId)
    setReplyDraft('')
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="post-reader comments-only" onClick={e => e.stopPropagation()}>
        <button className="reader-close" onClick={onClose} aria-label="close">
          <i className="ti ti-x"></i>
        </button>

        <div className="reader-body">
          <div className="reader-header">
            <i className="ti ti-message-circle-2" style={{ color: 'var(--orange)', fontSize: 18 }}></i>
            <div style={{ flex: 1 }}>
              <div className="reader-header-title">
                {post.username}'s roasts
                {post.userVerified && <span className="vbadge" style={{ marginLeft: 4 }}>✓</span>}
              </div>
              <div className="reader-header-sub">
                {roasts.length} {roasts.length === 1 ? 'roast' : 'roasts'} · {timeAgo(post.createdAt)}
              </div>
            </div>
          </div>

          <div className="roast-label" style={{ padding: '8px 0 0' }}>
            <i className="ti ti-medal" style={{ color: 'var(--orange)' }}></i>
            All roasts ({roasts.length}) — most liked first
          </div>

          <div className="roast-thread" ref={listRef}>
            {roasts.length === 0 && (
              <div className="roast-empty">No roasts yet — be the first to drop one 🔥</div>
            )}
            {roasts.map(r => {
              const isFocused = r.id === initialFocusId
              const roastReplies = replies[r.id] || []
              const isReplyOpen = replyOpenId === r.id
              return (
                <div
                  key={r.id}
                  ref={isFocused ? focusedRef : null}
                  className={`roast-item rn ${isFocused ? 'focused' : ''}`}
                >
                  <div className="rav" style={{ background: r.userAvatarColor || colorFromString(r.userId) }}>
                    {initialsFromName(r.username)}
                  </div>
                  <div className="roast-body">
                    <div className="ruser">
                      <span
                        className="clickable"
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); nav(`/u/${r.userId}`) }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            nav(`/u/${r.userId}`)
                          }
                        }}
                        style={{ color: '#bbb' }}
                      >{r.username}</span>
                      <span className="rago">· {timeAgo(r.createdAt)}</span>
                    </div>
                    <div className="rtext">{r.text}</div>
                    <div className="rfoot">
                      <span
                        className="rreply"
                        onClick={(e) => { e.stopPropagation(); toggleReply(r.id) }}
                      >
                        {isReplyOpen ? 'Cancel' : 'Reply'}
                      </span>
                      <button
                        type="button"
                        className={`rlaugh-btn ${laughed.has(r.id) ? 'voted' : ''}`}
                        onClick={(e) => { e.stopPropagation(); handleLaugh(r.id) }}
                        aria-label="laugh at roast"
                        aria-pressed={laughed.has(r.id)}
                      >
                        <span aria-hidden="true">😂</span>
                        <span className="laugh-count">{r.laughs || 0}</span>
                      </button>
                      <button
                        type="button"
                        className={`rupvote heart-btn ${voted.has(r.id) ? 'voted' : ''}`}
                        onClick={(e) => { e.stopPropagation(); handleUpvote(r.id) }}
                        aria-label="upvote roast"
                        aria-pressed={voted.has(r.id)}
                      >
                        <svg className="heart-icon" viewBox="0 0 24 24" aria-hidden="true">
                          <path
                            className="heart-path"
                            d="M12 21s-7.5-4.6-9.6-9.1C.7 8.1 2.6 4 6.4 4c2 0 3.6 1.1 4.6 2.7C12 5.1 13.6 4 15.6 4c3.8 0 5.7 4.1 4 7.9C19.5 16.4 12 21 12 21z"
                          />
                        </svg>
                        <span className="heart-count">{r.upvotes || 0}</span>
                      </button>
                    </div>

                    {/* Existing replies */}
                    {roastReplies.length > 0 && (
                      <div className="reply-list">
                        {roastReplies.map(rp => (
                          <div key={rp.id} className="reply-item">
                            <div
                              className="rav"
                              style={{ background: rp.userAvatarColor || colorFromString(rp.userId) }}
                            >
                              {initialsFromName(rp.username)}
                            </div>
                            <div className="rbody">
                              <div className="ruser">
                                <span
                                  className="clickable"
                                  role="button"
                                  tabIndex={0}
                                  onClick={(e) => { e.stopPropagation(); nav(`/u/${rp.userId}`) }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault()
                                      nav(`/u/${rp.userId}`)
                                    }
                                  }}
                                  style={{ color: '#bbb' }}
                                >{rp.username}</span>
                                <span className="rago">· {timeAgo(rp.createdAt)}</span>
                              </div>
                              <div className="rtext">{rp.text}</div>
                            </div>
                            {user && rp.userId === user.uid && (
                              <button
                                type="button"
                                className="reply-del"
                                aria-label="delete reply"
                                onClick={(e) => { e.stopPropagation(); handleDeleteReply(r.id, rp.id) }}
                              >
                                <i className="ti ti-x" style={{ fontSize: 12 }}></i>
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Reply input row */}
                    {isReplyOpen && (
                      <form
                        className="reply-write"
                        onClick={(e) => e.stopPropagation()}
                        onSubmit={(e) => {
                          e.preventDefault()
                          const text = replyDraft.trim()
                          if (!text) return
                          handleWriteReply(r.id, text)
                        }}
                      >
                        <input
                          className="roast-input"
                          placeholder="Write your reply here... 🔥"
                          value={replyDraft}
                          onChange={e => setReplyDraft(e.target.value)}
                          maxLength={240}
                          autoFocus
                        />
                        <button
                          type="submit"
                          className="fire-btn small"
                          aria-label="post reply"
                          disabled={!replyDraft.trim()}
                        >
                          <i className="ti ti-flame"></i>
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <form
            className="write-roast"
            onSubmit={(e) => {
              e.preventDefault()
              const text = draft.trim()
              if (!text || posting) return
              handleWrite(text)
            }}
            style={{ margin: '12px 0 0' }}
          >
            <input
              className="roast-input"
              placeholder="Drop your best roast here... 🔥"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              maxLength={240}
            />
            <button
              type="submit"
              className="fire-btn"
              aria-label="post roast"
              disabled={posting || !draft.trim()}
            >
              <i className="ti ti-flame"></i>
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

export default function PostCard({ post, feed }) {
  const { user, profile } = useAuth()
  const nav = useNavigate()
  const [roasts, setRoasts] = useState([])
  const [likedSet, setLikedSet] = useState(new Set())
  const [showLogin, setShowLogin] = useState(false)
  const [roastText, setRoastText] = useState('')
  const [posting, setPosting] = useState(false)
  const [voted, setVoted] = useState(() => new Set())
  const [laughed, setLaughed] = useState(() => new Set())
  const [expanded, setExpanded] = useState(false)
  // readerOpen: when true, the inline modal is showing for this post.
  // readerFocusId: which roast inside the modal to scroll/flash to (optional).
  const [readerOpen, setReaderOpen] = useState(false)
  const [readerFocusId, setReaderFocusId] = useState(null)
  // Track the most recent like for the burst animation key
  const [likeBurst, setLikeBurst] = useState(0)

  // Live roasts for this post
  useEffect(() => {
    if (!post?.id) return
    const unsub = subscribeRoasts(post.id, setRoasts)
    return unsub
  }, [post?.id])

  // Live like state for the current user
  useEffect(() => {
    if (!user) return setLikedSet(new Set())
    return subscribeLikedSet(user.uid, setLikedSet)
  }, [user])

  const liked = likedSet.has(post.id)

  const handleLike = async () => {
    if (!user) return setShowLogin(true)
    // Fire the burst animation optimistically (even before Firestore confirms).
    setLikeBurst(b => b + 1)
    try { await toggleLike(post.id, user.uid) }
    catch (e) { console.error(e) }
  }

  const handleSubmitRoast = async (e) => {
    e?.preventDefault()
    if (!user) return setShowLogin(true)
    const text = roastText.trim()
    if (!text || posting) return
    setPosting(true)
    try {
      await addRoast(post.id, {
        text,
        userId: user.uid,
        username: profile?.username || user.displayName || user.email?.split('@')[0],
        userAvatarColor: profile?.avatarColor || colorFromString(user.uid)
      })
      setRoastText('')
    } catch (err) { console.error(err) }
    finally { setPosting(false) }
  }

  const handleUpvoteRoast = async (roastId) => {
    if (!user) return setShowLogin(true)
    try {
      await toggleRoastUpvote(post.id, roastId, user.uid)
      setVoted(s => {
        const n = new Set(s)
        n.has(roastId) ? n.delete(roastId) : n.add(roastId)
        return n
      })
    } catch (e) { console.error(e) }
  }

  const handleLaughRoast = async (roastId) => {
    if (!user) return setShowLogin(true)
    try {
      await toggleRoastLaugh(post.id, roastId, user.uid)
      setLaughed(s => {
        const n = new Set(s)
        n.has(roastId) ? n.delete(roastId) : n.add(roastId)
        return n
      })
    } catch (e) { console.error(e) }
  }

  const share = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: 'RoastBoard', url: window.location.href }) } catch {}
    } else {
      try {
        await navigator.clipboard.writeText(window.location.href)
        alert('Link copied!')
      } catch {}
    }
  }

  // Opens the inline reader. If a roastId is passed, that roast scrolls into
  // view + flashes. If undefined, the reader just opens at the top.
  const openReader = (roastId) => {
    if (!post?.id) {
      // eslint-disable-next-line no-console
      console.warn('[RoastBoard] openReader: post.id missing', post)
      return
    }
    if (import.meta.env.DEV) console.info('[RoastBoard] opening reader for', post.id, 'focus', roastId)
    setReaderFocusId(roastId || null)
    setReaderOpen(true)
  }

  const closeReader = () => {
    setReaderOpen(false)
    // keep readerFocusId around so the next open animation is consistent
  }

  const rank = rankFor(post, feed)
  const visibleRoasts = expanded ? roasts : roasts.slice(0, 3)
  const hiddenCount = Math.max(0, roasts.length - 3)
  const avColor = post.userAvatarColor || colorFromString(post.userId)
  const avInitials = initialsFromName(post.username)

  return (
    <div className="post-card">
      <div className="pic-block" style={{ height: 310 }}>
        {post.imageUrl
          ? <img src={post.imageUrl} alt={post.caption} />
          : <div className="pic-emoji">{emojiForPost(post)}</div>}
        <div className="pic-label">{post.username} ki pic</div>
        <div className={`rank-badge ${rank.cls}`}>
          <i className={`ti ${rank.icon}`}></i>{rank.label}
        </div>
        <div className="vote-bar">
          <button
            className={`vbtn heart-btn ${liked ? 'liked' : ''}`}
            onClick={handleLike}
            aria-label={liked ? 'unlike' : 'like'}
            aria-pressed={liked}
          >
            <span className="heart-wrap" key={likeBurst}>
              <span className="heart"></span>
              <span className="heart-burst" aria-hidden="true">
                <span className="particle p1"></span>
                <span className="particle p2"></span>
                <span className="particle p3"></span>
                <span className="particle p4"></span>
                <span className="particle p5"></span>
                <span className="particle p6"></span>
              </span>
            </span>
            <span>{post.likes || 0}</span>
          </button>
          <div className="vbtn" role="button" aria-label="fire">
            <i className="ti ti-flame"></i>
            <span>{post.fireCount || 0}</span>
          </div>
          <div className="vbtn" onClick={share} role="button" aria-label="share">
            <i className="ti ti-share"></i>
            <span>{post.shareCount || 0}</span>
          </div>
        </div>
      </div>

      <div className="post-info">
        <div className="user-row">
          <div
            className="av clickable"
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); nav(`/u/${post.userId}`) }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                nav(`/u/${post.userId}`)
              }
            }}
            aria-label={`open ${post.username}'s profile`}
            style={{ background: avColor, cursor: 'pointer' }}
          >{avInitials}</div>
          <span
            className="username clickable"
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); nav(`/u/${post.userId}`) }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                nav(`/u/${post.userId}`)
              }
            }}
            aria-label={`open ${post.username}'s profile`}
          >
            {post.username}
            {post.userVerified && <span className="vbadge">✓</span>}
          </span>
          <span className="ago">{timeAgo(post.createdAt)}</span>
        </div>
        <div className="post-title">{post.caption}</div>
      </div>

      <div className="roast-section">
        <div className="roast-label">
          <i className="ti ti-medal" style={{ color: 'var(--orange)' }}></i>
          {expanded ? `All roasts (${roasts.length})` : 'Top roasts — most liked first'}
        </div>

        {visibleRoasts.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-mute)', padding: '8px 4px' }}>
            No roasts yet — be the first to drop one 🔥
          </div>
        )}

        {visibleRoasts.map((r, i) => {
          const showRank = !expanded && i < 3
          const cls = showRank
            ? (i === 0 ? 'top-r' : 'r' + (i + 1))
            : 'rn'
          return (
            <div
              key={r.id}
              className={`roast-item ${cls} clickable`}
              role="button"
              tabIndex={0}
              onClick={() => openReader(r.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  openReader(r.id)
                }
              }}
              title="Tap to open full thread"
            >
              <div className="rav" style={{ background: r.userAvatarColor || colorFromString(r.userId) }}>
                {initialsFromName(r.username)}
              </div>
              <div className="roast-body">
                <div className="ruser">
                  {r.username}
                  {showRank && i === 0 && (
                    <span className="rtag" style={{ background: '#2e1400', color: 'var(--orange-2)' }}>🥇 #1</span>
                  )}
                  {showRank && i === 1 && (
                    <span className="rtag" style={{ background: '#1a1a2e', color: '#8888cc' }}>#2</span>
                  )}
                  {showRank && i === 2 && (
                    <span className="rtag" style={{ background: '#1a1a2e', color: '#8888cc' }}>#3</span>
                  )}
                </div>
                <div className="rtext">{r.text}</div>
                <div className="rfoot">
                  <span
                    className="rreply"
                    onClick={(e) => { e.stopPropagation(); openReader(r.id) }}
                  >
                    <i className="ti ti-arrow-back-up"></i> Reply
                  </span>
                  <button
                    type="button"
                    className={`rlaugh-btn ${laughed.has(r.id) ? 'voted' : ''}`}
                    onClick={(e) => { e.stopPropagation(); handleLaughRoast(r.id) }}
                    aria-label="laugh at roast"
                    aria-pressed={laughed.has(r.id)}
                  >
                    <span aria-hidden="true">😂</span>
                    <span className="laugh-count">{r.laughs || 0}</span>
                  </button>
                  <button
                    type="button"
                    className={`rupvote heart-btn ${voted.has(r.id) ? 'voted' : ''}`}
                    onClick={(e) => { e.stopPropagation(); handleUpvoteRoast(r.id) }}
                    aria-label="upvote roast"
                    aria-pressed={voted.has(r.id)}
                  >
                    <svg className="heart-icon" viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        className="heart-path"
                        d="M12 21s-7.5-4.6-9.6-9.1C.7 8.1 2.6 4 6.4 4c2 0 3.6 1.1 4.6 2.7C12 5.1 13.6 4 15.6 4c3.8 0 5.7 4.1 4 7.9C19.5 16.4 12 21 12 21z"
                      />
                    </svg>
                    <span className="heart-count">{r.upvotes || 0}</span>
                  </button>
                </div>
              </div>
            </div>
          )
        })}

        {hiddenCount > 0 && !expanded && (
          <button
            className="view-all-roasts"
            onClick={() => openReader()}
            type="button"
            title="Open full thread in a reader view"
          >
            View all {roasts.length} roasts <i className="ti ti-arrow-up-right"></i>
          </button>
        )}

        {expanded && roasts.length > 3 && (
          <button
            className="view-all-roasts"
            onClick={() => setExpanded(false)}
            type="button"
          >
            Show less <i className="ti ti-chevron-up"></i>
          </button>
        )}
      </div>

      <form className="write-roast" onSubmit={handleSubmitRoast}>
        <input
          className="roast-input"
          placeholder="Drop your best roast here... 🔥"
          value={roastText}
          onChange={e => setRoastText(e.target.value)}
          maxLength={240}
        />
        <button type="submit" className="fire-btn" aria-label="post roast" disabled={posting}>
          <i className="ti ti-flame"></i>
        </button>
      </form>

      <div className="quick-actions">
        <button
          className={`qa-btn qa-like ${liked ? 'liked' : ''}`}
          onClick={handleLike}
          aria-label={liked ? 'unlike' : 'like'}
          aria-pressed={liked}
        >
          <span className="heart-wrap" key={likeBurst}>
            <span className="heart"></span>
            <span className="heart-burst" aria-hidden="true">
              <span className="particle p1"></span>
              <span className="particle p2"></span>
              <span className="particle p3"></span>
              <span className="particle p4"></span>
              <span className="particle p5"></span>
              <span className="particle p6"></span>
            </span>
          </span>
          <span className="qa-label">{post.likes || 0}</span>
        </button>
        <button
          className="qa-btn qa-comment"
          onClick={() => openReader()}
          aria-label="view roasts"
        >
          <i className="ti ti-message-circle-2"></i>
          <span className="qa-label">{post.roastCount || 0}</span>
        </button>
        <button
          className="qa-btn qa-share"
          onClick={share}
          aria-label="share"
        >
          <i className="ti ti-share-3"></i>
          <span className="qa-label">Share</span>
        </button>
      </div>

      {/* Reader modal — opens on any roast click. No router involved. */}
      {readerOpen && post && (
        <PostReaderModal
          post={post}
          initialFocusId={readerFocusId}
          onClose={closeReader}
          onLogin={() => setShowLogin(true)}
        />
      )}

      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
    </div>
  )
}
