import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { colorFromString, initialsFromName, timeAgo } from '../utils.js'
import { deleteReply } from '../services/db.js'

/**
 * Renders the full list of roasts for a post, sorted by upvotes.
 * `onUpvote` is provided by the parent (so the same handler wires up the
 * login modal + Firestore transaction + optimistic UI from PostCard).
 *
 * `mode="preview"` → numbered badges #1, #2, #3 only on the first 3.
 * `mode="full"`    → no numbered badges, just chronological upvote order.
 *
 * If `focusId` is passed (e.g. ?focus=roastId in URL), that roast scrolls
 * into view + briefly flashes to draw attention.
 *
 * Replies (1 level, text-only):
 *   - `replies`        → { [roastId]: Reply[] } from the parent
 *   - `onWriteReply`   → (roastId, text) => void
 *   - `onDeleteReply`  → (roastId, replyId) => void  (parent wires delete)
 *   - The Reply span on each roast toggles a small input row underneath.
 */
export default function RoastThread({
  roasts, voted, laughed, onUpvote, onLaugh, onWriteRoast, posting,
  mode = 'preview', focusId = null,
  replies = {}, onWriteReply, onDeleteReply
}) {
  const { user } = useAuth()
  const nav = useNavigate()
  const [draft, setDraft] = useState('')
  const [replyOpenId, setReplyOpenId] = useState(null)
  const [replyDraft, setReplyDraft] = useState('')
  const focusedRef = useRef(null)
  const listRef = useRef(null)

  // When focusId is in props, scroll to that roast + flash it.
  useEffect(() => {
    if (!focusId || !roasts.length) return
    requestAnimationFrame(() => {
      const el = focusedRef.current
      if (!el) return
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add('flash')
      setTimeout(() => el.classList.remove('flash'), 1800)
    })
  }, [focusId, roasts])

  const submit = (e) => {
    e?.preventDefault()
    const text = draft.trim()
    if (!text || posting) return
    onWriteRoast?.(text)
    setDraft('')
  }

  const submitReply = (roastId) => (e) => {
    e?.preventDefault()
    const text = replyDraft.trim()
    if (!text) return
    onWriteReply?.(roastId, text)
    setReplyDraft('')
    setReplyOpenId(null)
  }

  const toggleReply = (roastId) => {
    setReplyOpenId(prev => prev === roastId ? null : roastId)
    setReplyDraft('')
  }

  return (
    <div className="roast-thread" ref={listRef}>
      {roasts.length === 0 && (
        <div className="roast-empty">
          No roasts yet — be the first to drop one 🔥
        </div>
      )}

      {roasts.map((r, i) => {
        const isTop3 = mode === 'preview' && i < 3
        const rankCls = i === 0 ? 'top-r' : (i === 1 ? 'r2' : i === 2 ? 'r3' : 'rn')
        const isFocused = r.id === focusId
        const roastReplies = replies[r.id] || []
        const isReplyOpen = replyOpenId === r.id
        return (
          <div
            key={r.id}
            ref={isFocused ? focusedRef : null}
            className={`roast-item ${isTop3 ? rankCls : 'rn'} ${isFocused ? 'focused' : ''}`}
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
                {mode === 'preview' && i === 0 && (
                  <span className="rtag" style={{ background: '#2e1400', color: 'var(--orange-2)' }}>🥇 #1</span>
                )}
                {mode === 'preview' && i === 1 && (
                  <span className="rtag" style={{ background: '#1a1a2e', color: '#8888cc' }}>#2</span>
                )}
                {mode === 'preview' && i === 2 && (
                  <span className="rtag" style={{ background: '#1a1a2e', color: '#8888cc' }}>#3</span>
                )}
                {mode === 'full' && (
                  <span className="rago">· {timeAgo(r.createdAt)}</span>
                )}
              </div>
              <div className="rtext">{r.text}</div>
              <div className="rfoot">
                <span className="rlaugh" aria-hidden="true">😂</span>
                <button
                  type="button"
                  className={`rupvote heart-btn ${voted.has(r.id) ? 'voted' : ''}`}
                  onClick={(e) => { e.stopPropagation(); onUpvote?.(r.id) }}
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
                {onWriteReply && (
                  <span className="rreply" onClick={(e) => { e.stopPropagation(); toggleReply(r.id) }}>
                    {isReplyOpen ? 'Cancel' : 'Reply'}
                  </span>
                )}
              </div>

              {/* Existing replies (always shown when present) */}
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
                          {mode === 'full' && (
                            <span className="rago">· {timeAgo(rp.createdAt)}</span>
                          )}
                        </div>
                        <div className="rtext">{rp.text}</div>
                      </div>
                      {user && rp.userId === user.uid && onDeleteReply && (
                        <button
                          type="button"
                          className="reply-del"
                          aria-label="delete reply"
                          onClick={(e) => { e.stopPropagation(); onDeleteReply?.(r.id, rp.id) }}
                        >
                          <i className="ti ti-x" style={{ fontSize: 12 }}></i>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Reply input row (only when Reply was clicked) */}
              {isReplyOpen && onWriteReply && (
                <form className="reply-write" onSubmit={submitReply(r.id)}>
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

      {onWriteRoast && (
        <form className="write-roast" onSubmit={submit} style={{ margin: '10px 0 4px' }}>
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
      )}
    </div>
  )
}
