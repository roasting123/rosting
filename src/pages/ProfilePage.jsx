import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import {
  subscribeUserPosts,
  subscribeUserRoastScore,
  getUserRoastScore,
  writeUserRoastScore,
  getUser
} from '../services/db.js'
import { colorFromString, initialsFromName } from '../utils.js'
import PostCard from '../components/PostCard.jsx'
import LoginModal from '../components/LoginModal.jsx'
import RoastStars from '../components/RoastStars.jsx'
import { usePullToRefresh, PullToRefreshIndicator } from '../hooks/usePullToRefresh.jsx'
import { useNavigate, useParams } from 'react-router-dom'

export default function ProfilePage() {
  const { user, profile, signOut } = useAuth()
  const { uid: routeUid } = useParams()
  const nav = useNavigate()

  // The "viewed" user. Falls back to the signed-in user when no :uid is in
  // the URL (the bottom-nav Profile button hits /profile, not /u/<own-uid>).
  // When routeUid is set and differs from the signed-in user, this is a
  // public view of someone else's profile — owner actions (Edit / Sign out
  // / pull-to-refresh) are hidden.
  const viewedUid = routeUid || user?.uid || null
  const isMe = !routeUid || (user && routeUid === user.uid)

  const [viewedProfile, setViewedProfile] = useState(null)
  const [posts, setPosts] = useState([])
  const [roastScore, setRoastScore] = useState(0)
  const [showLogin, setShowLogin] = useState(false)
  const [refreshToast, setRefreshToast] = useState('')
  const [copied, setCopied] = useState(false)

  // Fetch the viewed user's profile data when the URL changes. For the
  // owner's own profile we use the auth context's `profile` (live) so
  // any profile-edit save is reflected without a re-read.
  useEffect(() => {
    if (isMe) {
      setViewedProfile(profile || null)
      return
    }
    if (!viewedUid) return
    let alive = true
    getUser(viewedUid).then(p => { if (alive) setViewedProfile(p || null) })
    return () => { alive = false }
  }, [isMe, viewedUid, profile])

  useEffect(() => {
    if (!viewedUid) return
    return subscribeUserPosts(viewedUid, setPosts)
  }, [viewedUid])

  useEffect(() => {
    if (!viewedUid) { setRoastScore(0); return }
    return subscribeUserRoastScore(viewedUid, setRoastScore)
  }, [viewedUid])

  /**
   * Pull-to-refresh handler: walks every post, sums upvotes on its roasts,
   * and writes the cumulative total back to the user doc so stars appear
   * immediately. The Cloud Function (when deployed) will keep this fresh
   * automatically; this is a manual repair. Owner-only — other profiles
   * don't get the gesture.
   */
  const onRefresh = useCallback(async () => {
    if (!user || !isMe) return
    try {
      const { total } = await getUserRoastScore(user.uid)
      await writeUserRoastScore(user.uid, total)
      setRoastScore(total)
      setRefreshToast(`Score synced: ${total} roast likes`)
      setTimeout(() => setRefreshToast(''), 1800)
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[ProfilePage] refresh failed:', e)
      setRefreshToast('Refresh failed — try again')
      setTimeout(() => setRefreshToast(''), 1800)
    }
  }, [user, isMe])

  // Only wire pull-to-refresh for the owner — on someone else's profile
  // the gesture fights with the read-only view.
  const { pull, refreshing, ptrHandlers, onScroll } = usePullToRefresh({
    onRefresh: isMe ? onRefresh : async () => {}
  })

  // Hard fallback: no signed-in user AND no :uid in URL → show login CTA.
  // (When :uid is set we render the public view below regardless of auth.)
  if (!viewedUid) {
    return (
      <div className="page" {...ptrHandlers} onScroll={onScroll}>
        <PullToRefreshIndicator pull={pull} refreshing={refreshing} />
        <div className="center-state">
          <i className="ti ti-user"></i>
          <div>Login to view your profile.</div>
          <button className="nudge-btn" style={{ marginTop: 14 }} onClick={() => nav('/auth')}>
            Sign in
          </button>
        </div>
        {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
      </div>
    )
  }

  // The "effective" profile — auth-context when owner, fetched when not.
  const p = isMe ? profile : viewedProfile
  const avColor = p?.avatarColor || colorFromString(viewedUid)
  const avInitials = initialsFromName(p?.displayName || p?.username || (isMe ? user?.displayName : null))
  const handle = `@${p?.username || 'user'}`
  const copyHandle = async () => {
    try {
      await navigator.clipboard.writeText(handle)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {}
  }
  const totalLikes = posts.reduce((s, post) => s + (post.likes || 0), 0)
  const totalRoasts = posts.reduce((s, post) => s + (post.roastCount || 0), 0)
  const followers = p?.followerIds?.length || 0
  const displayName = p?.displayName || p?.username || (isMe ? user?.displayName : null) || 'user'

  return (
    <div className="page" {...(isMe ? ptrHandlers : {})} onScroll={isMe ? onScroll : undefined}>
      {isMe && <PullToRefreshIndicator pull={pull} refreshing={refreshing} />}
      <div className="page-header">
        <button className="page-back" onClick={() => nav(-1)} aria-label="back">
          <i className="ti ti-arrow-left"></i>
        </button>
        <h2 className="page-title">{isMe ? 'Your profile' : `${p?.username || 'User'}'s profile`}</h2>
      </div>
      <div className="profile-header">
        <div className="profile-av" style={{ background: avColor }}>{avInitials}</div>
        <div style={{ flex: 1 }}>
          <div className="profile-name">
            {displayName}
            {p?.verified && <span className="vbadge" style={{ marginLeft: 6 }}>✓</span>}
          </div>
          <div className="profile-handle">
            <span>{handle}</span>
            <button
              type="button"
              className="handle-copy"
              onClick={copyHandle}
              aria-label="copy username"
              title="Copy username"
            >
              <i className={`ti ${copied ? 'ti-check' : 'ti-copy'}`}></i>
              {copied ? <span>Copied</span> : <span>Copy</span>}
            </button>
          </div>
          {p?.bio && (
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 6, lineHeight: 1.4 }}>
              {p.bio}
            </div>
          )}
          <div style={{ marginTop: 8 }}>
            <RoastStars userId={viewedUid} total={roastScore} />
          </div>
        </div>
        {isMe && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
            <button
              onClick={() => nav('/profile/edit')}
              style={{ background: 'var(--orange-soft)', color: 'var(--orange-2)',
                       border: 'none', borderRadius: 8,
                       padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
            >Edit profile</button>
            <button
              onClick={async () => { await signOut(); nav('/auth') }}
              style={{ background: 'transparent', color: 'var(--text-dim)',
                       border: '1px solid var(--border-2)', borderRadius: 8,
                       padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}
            >Sign out</button>
          </div>
        )}
      </div>

      <div className="profile-stats">
        <div className="stat-item"><div className="stat-num">{posts.length}</div><div className="stat-lbl">Posts</div></div>
        <div className="stat-item"><div className="stat-num">{totalLikes}</div><div className="stat-lbl">Likes</div></div>
        <div className="stat-item"><div className="stat-num">{totalRoasts}</div><div className="stat-lbl">Roasts</div></div>
        <div className="stat-item"><div className="stat-num">{followers}</div><div className="stat-lbl">Followers</div></div>
      </div>

      <div className="section-h">
        <i className="ti ti-photo"></i> {isMe ? 'Your posts' : `${p?.username || 'User'}'s posts`}
      </div>
      <div className="feed">
        {posts.length === 0 && (
          <div className="center-state" style={{ padding: 20 }}>
            <i className="ti ti-upload"></i>{isMe ? "You haven't posted yet." : "No posts yet."}
            {isMe && (
              <div style={{ marginTop: 12 }}>
                <button className="nudge-btn" onClick={() => nav('/upload')}>Upload first pic</button>
              </div>
            )}
          </div>
        )}
        {posts.map(post => <PostCard key={post.id} post={post} feed={posts} />)}
      </div>

      {isMe && refreshToast && (
        <div className="ptr-toast" role="status" aria-live="polite">
          <i className="ti ti-check"></i> {refreshToast}
        </div>
      )}
    </div>
  )
}
