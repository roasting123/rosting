import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { subscribeRoasts, addRoast, toggleRoastUpvote, getPost, subscribeLikedSet, toggleLike, subscribeReplies, addReply, deleteReply }
  from '../services/db.js'
import { colorFromString, initialsFromName, timeAgo, emojiForPost } from '../utils.js'
import LoginModal from './LoginModal.jsx'

/**
 * Full-screen reader for a single post + ALL of its roasts.
 *
 * Routes:
 *   /post/:postId                  → open in feed reader
 *   /post/:postId?from=/           → when closed, navigate back to `from` (default `/`)
 *   /post/:postId?focus=<roastId>  → scroll to + highlight that roast on open
 *
 * Clicking any roast in PostCard navigates here so the user can read the
 * full thread comfortably.
 */
export default function PostReader() {
  const { postId } = useParams()
  const [params] = useSearchParams()
  const nav = useNavigate()
  const from = params.get('from') || '/'
  const focusId = params.get('focus') || null
  const { user, profile } = useAuth()

  const [post, setPost]     = useState(null)
  const [roasts, setRoasts] = useState([])
  const [likedSet, setLikedSet] = useState(new Set())
  const [voted, setVoted]   = useState(new Set())
  const [replies, setReplies] = useState({}) // { [roastId]: Reply[] }
  const [showLogin, setShowLogin] = useState(false)
  const [posting, setPosting] = useState(false)
  const [loading, setLoading] = useState(true)
  const listRef = useRef(null)
  const focusedRef = useRef(null)

  useEffect(() => {
    let alive = true
    getPost(postId).then(p => { if (alive) { setPost(p); setLoading(false) } })
    return () => { alive = false }
  }, [postId])

  useEffect(() => {
    if (!postId) return
    return subscribeRoasts(postId, setRoasts)
  }, [postId])

  // Live replies per roast. We re-subscribe when the roast list changes
  // (e.g. a new roast was just added) so the new roast's replies are
  // picked up too. Cleanup tears down old subscriptions.
  useEffect(() => {
    if (!postId || !roasts.length) return
    const unsubs = roasts.map(r =>
      subscribeReplies(postId, r.id, list => {
        setReplies(prev => ({ ...prev, [r.id]: list }))
      })
    )
    return () => unsubs.forEach(u => u && u())
  }, [postId, roasts])

  // When ?focus=<roastId> is in the URL (came from clicking a specific roast),
  // scroll to it + flash a highlight once the roasts have loaded.
  useEffect(() => {
    if (!focusId || !roasts.length) return
    // Wait one paint for the focused node to be in the DOM.
    requestAnimationFrame(() => {
      const el = focusedRef.current
      if (!el) return
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add('flash')
      setTimeout(() => el.classList.remove('flash'), 1800)
    })
  }, [focusId, roasts])

  useEffect(() => {
    if (!user) return setLikedSet(new Set())
    return subscribeLikedSet(user.uid, setLikedSet)
  }, [user])

  const liked = !!user && likedSet.has(postId)
  const avColor = post?.userAvatarColor || colorFromString(post?.userId)
  const avInit  = initialsFromName(post?.username)

  const close = () => nav(from)

  const handleUpvote = async (roastId) => {
    if (!user) return setShowLogin(true)
    try {
      await toggleRoastUpvote(postId, roastId, user.uid)
      setVoted(s => {
        const n = new Set(s)
        n.has(roastId) ? n.delete(roastId) : n.add(roastId)
        return n
      })
    } catch (e) { console.error(e) }
  }

  const handleLike = async () => {
    if (!user) return setShowLogin(true)
    try { await toggleLike(postId, user.uid) } catch (e) { console.error(e) }
  }

  const handleWrite = async (text) => {
    if (!user) return setShowLogin(true)
    setPosting(true)
    try {
      await addRoast(postId, {
        text,
        userId: user.uid,
        username: profile?.username || user.displayName || user.email?.split('@')[0],
        userAvatarColor: profile?.avatarColor || colorFromString(user.uid)
      })
    } catch (e) { console.error(e) }
    finally { setPosting(false) }
  }

  const handleWriteReply = async (roastId, text) => {
    if (!user) return setShowLogin(true)
    try {
      await addReply(postId, roastId, {
        text,
        userId: user.uid,
        username: profile?.username || user.displayName || user.email?.split('@')[0],
        userAvatarColor: profile?.avatarColor || colorFromString(user.uid)
      })
    } catch (e) { console.error(e) }
  }

  const handleDeleteReply = async (roastId, replyId) => {
    if (!user) return
    try {
      await deleteReply(postId, roastId, replyId, user.uid)
    } catch (e) { console.error(e) }
  }

  if (loading) {
    return (
      <div className="modal-backdrop" onClick={close}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <i className="ti ti-loader" style={{ fontSize: 28 }}></i>
          <p>Loading…</p>
        </div>
      </div>
    )
  }
  if (!post) {
    return (
      <div className="modal-backdrop" onClick={close}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <h3>Post not found</h3>
          <p>This post may have been deleted.</p>
          <div className="modal-actions">
            <button className="primary" onClick={close}>Go back</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="post-reader" onClick={e => e.stopPropagation()}>
        <button className="reader-close" onClick={close} aria-label="close">
          <i className="ti ti-x"></i>
        </button>

        <div className="reader-pic">
          {post.imageUrl
            ? <img src={post.imageUrl} alt={post.caption} />
            : <div className="pic-emoji" style={{ width: '100%', textAlign: 'center' }}>{emojiForPost(post)}</div>}
        </div>

        <div className="reader-body">
          <div className="user-row" style={{ marginBottom: 8 }}>
            <div className="av" style={{ background: avColor, width: 32, height: 32, fontSize: 11 }}>
              {avInit}
            </div>
            <span className="username">{post.username}{post.userVerified && <span className="vbadge">✓</span>}</span>
            <span className="ago">{timeAgo(post.createdAt)}</span>
          </div>
          <div className="post-title" style={{ marginBottom: 12 }}>{post.caption}</div>

          <div className="post-actions" style={{ borderTop: 'none', padding: '0 0 8px' }}>
            <div className={`pact ${liked ? 'active' : ''}`} onClick={handleLike}>
              <i className="ti ti-heart"></i><span>{post.likes || 0} likes</span>
            </div>
            <div className="pact">
              <i className="ti ti-message-circle"></i><span>{roasts.length} roasts</span>
            </div>
          </div>

          <div className="roast-label" style={{ padding: '8px 0 0' }}>
            <i className="ti ti-medal" style={{ color: 'var(--orange)' }}></i>
            All roasts ({roasts.length}) — most liked first
          </div>

          <RoastThread
            roasts={roasts}
            voted={voted}
            onUpvote={handleUpvote}
            onWriteRoast={handleWrite}
            posting={posting}
            mode="full"
            focusId={focusId}
            replies={replies}
            onWriteReply={handleWriteReply}
            onDeleteReply={handleDeleteReply}
          />
        </div>
      </div>

      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
    </div>
  )
}
