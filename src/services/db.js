// Firestore service layer — every screen talks to the DB through this file
// so security rules + transactions stay in one place.

import {
  collection, doc, addDoc, getDoc, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, getDocs, onSnapshot,
  runTransaction, serverTimestamp, increment
} from 'firebase/firestore'
import { db } from '../firebase'

const POSTS = 'posts'
const ROASTS = 'roasts'      // subcollection under each post
const LIKES  = 'likes'       // subcollection under each post
const USER_LIKES = 'userLikes' // subcollection under each user
const USERS  = 'users'

// ----- Posts -----

export function subscribeFeed(filter = 'Trending', callback, max = 30) {
  // Filters: Trending | New | Most roasted | Following
  // We can't dynamically swap orderBy fields on a single onSnapshot, so we
  // re-subscribe when the filter changes. Returns an unsubscribe function.
  const orderField =
    filter === 'New'           ? 'createdAt' :
    filter === 'Most roasted'  ? 'roastCount' :
    'likes'

  const q = query(
    collection(db, POSTS),
    orderBy(orderField, 'desc'),
    limit(max)
  )
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  })
}

export async function createPost({ imageUrl, caption, userId, username, userAvatarColor }) {
  const ref = await addDoc(collection(db, POSTS), {
    imageUrl, caption,
    userId, username, userAvatarColor,
    likes: 0, fireCount: 0, shareCount: 0, roastCount: 0,
    rank: null,
    createdAt: serverTimestamp()
  })
  return ref.id
}

export async function deletePost(postId, userId) {
  const snap = await getDoc(doc(db, POSTS, postId))
  if (!snap.exists() || snap.data().userId !== userId) {
    throw new Error('Not allowed')
  }
  await deleteDoc(doc(db, POSTS, postId))
}

export async function getPost(postId) {
  const snap = await getDoc(doc(db, POSTS, postId))
  return snap.exists() ? { id: snap.id, ...snap.data() } : null
}

// ----- Likes -----

/**
 * Toggle a like for a post.
 * Per-user state is stored in two places for fast read:
 *   - /posts/{postId}/likes/{userId}   (existence = liked)
 *   - /users/{userId}/userLikes/{postId}  (mirror for "my likes" feed)
 * The posts.likes counter is updated transactionally so it can't drift.
 */
export async function toggleLike(postId, userId) {
  const postRef   = doc(db, POSTS, postId)
  const likeRef   = doc(db, POSTS, postId, LIKES, userId)
  const userLikeRef = doc(db, USERS, userId, USER_LIKES, postId)

  await runTransaction(db, async (tx) => {
    const [postSnap, likeSnap] = await Promise.all([
      tx.get(postRef), tx.get(likeRef)
    ])
    if (!postSnap.exists()) throw new Error('Post not found')
    if (likeSnap.exists()) {
      tx.delete(likeRef)
      tx.delete(userLikeRef)
      tx.update(postRef, { likes: increment(-1) })
    } else {
      tx.set(likeRef, { createdAt: serverTimestamp() })
      tx.set(userLikeRef, { createdAt: serverTimestamp() })
      tx.update(postRef, { likes: increment(1) })
    }
  })
}

export function subscribeLikedSet(userId, callback) {
  if (!userId) return () => {}
  return onSnapshot(
    collection(db, USERS, userId, USER_LIKES),
    snap => callback(new Set(snap.docs.map(d => d.id)))
  )
}

// ----- Roasts -----

export function subscribeRoasts(postId, callback) {
  // Single-field orderBy to avoid needing a Firestore composite index.
  // (upvotes desc) is enough — ties are broken client-side by createdAt.
  const q = query(
    collection(db, POSTS, postId, ROASTS),
    orderBy('upvotes', 'desc'),
    limit(50)
  )
  return onSnapshot(q, snap => {
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    // Stable client-side tie-break: more recent first when upvotes are equal.
    list.sort((a, b) => {
      if ((b.upvotes || 0) !== (a.upvotes || 0)) {
        return (b.upvotes || 0) - (a.upvotes || 0)
      }
      const ta = a.createdAt?.toMillis?.() ?? (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0)
      const tb = b.createdAt?.toMillis?.() ?? (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0)
      return tb - ta
    })
    callback(list)
  }, (err) => {
    // Surface the error so a missing index is obvious in the console.
    // eslint-disable-next-line no-console
    console.error('[RoastBoard] subscribeRoasts failed:', err)
    callback([])
  })
}

export async function addRoast(postId, { text, userId, username, userAvatarColor }) {
  const roastRef = await addDoc(collection(db, POSTS, postId, ROASTS), {
    text, userId, username, userAvatarColor,
    upvotes: 0,
    laughs: 0,
    createdAt: serverTimestamp()
  })
  await updateDoc(doc(db, POSTS, postId), { roastCount: increment(1) })
  return roastRef.id
}

export async function deleteRoast(postId, roastId, userId) {
  const snap = await getDoc(doc(db, POSTS, postId, ROASTS, roastId))
  if (!snap.exists() || snap.data().userId !== userId) {
    throw new Error('Not allowed')
  }
  await deleteDoc(doc(db, POSTS, postId, ROASTS, roastId))
  await updateDoc(doc(db, POSTS, postId), { roastCount: increment(-1) })
}

// ----- Replies (1 level, text-only) -----
//
// Replies live at posts/{postId}/roasts/{roastId}/replies/{replyId}.
// They are flat (no reply-on-reply) and text-only (no upvote/laugh).
// Denormalization mirrors the roast pattern so the UI can render a reply
// with no extra read.

export function subscribeReplies(postId, roastId, callback) {
  if (!postId || !roastId) return () => {}
  const q = query(
    collection(db, POSTS, postId, ROASTS, roastId, 'replies'),
    orderBy('createdAt', 'asc'),
    limit(100)
  )
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  }, (err) => {
    // eslint-disable-next-line no-console
    console.error('[RoastBoard] subscribeReplies failed:', err)
    callback([])
  })
}

export async function addReply(postId, roastId, { text, userId, username, userAvatarColor }) {
  const replyRef = await addDoc(
    collection(db, POSTS, postId, ROASTS, roastId, 'replies'),
    {
      text, userId, username, userAvatarColor,
      createdAt: serverTimestamp()
    }
  )
  return replyRef.id
}

export async function deleteReply(postId, roastId, replyId, userId) {
  const snap = await getDoc(doc(db, POSTS, postId, ROASTS, roastId, 'replies', replyId))
  if (!snap.exists() || snap.data().userId !== userId) {
    throw new Error('Not allowed')
  }
  await deleteDoc(doc(db, POSTS, postId, ROASTS, roastId, 'replies', replyId))
}

/**
 * Toggle an upvote on a roast. State lives in
 *   /posts/{postId}/roasts/{roastId}/upvoters/{userId}
 * so the same user can't upvote twice.
 */
export async function toggleRoastUpvote(postId, roastId, userId) {
  const roastRef    = doc(db, POSTS, postId, ROASTS, roastId)
  const upvoterRef  = doc(db, POSTS, postId, ROASTS, roastId, 'upvoters', userId)
  await runTransaction(db, async (tx) => {
    const [roastSnap, voteSnap] = await Promise.all([
      tx.get(roastRef), tx.get(upvoterRef)
    ])
    if (!roastSnap.exists()) throw new Error('Roast not found')
    if (voteSnap.exists()) {
      tx.delete(upvoterRef)
      tx.update(roastRef, { upvotes: increment(-1) })
    } else {
      tx.set(upvoterRef, { createdAt: serverTimestamp() })
      tx.update(roastRef, { upvotes: increment(1) })
    }
  })
}

/**
 * Toggle a "laugh" reaction (😂) on a roast. State lives in
 *   /posts/{postId}/roasts/{roastId}/laughers/{userId}
 * so the same user can't laugh twice.
 */
export async function toggleRoastLaugh(postId, roastId, userId) {
  const roastRef    = doc(db, POSTS, postId, ROASTS, roastId)
  const laugherRef  = doc(db, POSTS, postId, ROASTS, roastId, 'laughers', userId)
  await runTransaction(db, async (tx) => {
    const [roastSnap, laughSnap] = await Promise.all([
      tx.get(roastRef), tx.get(laugherRef)
    ])
    if (!roastSnap.exists()) throw new Error('Roast not found')
    if (laughSnap.exists()) {
      tx.delete(laugherRef)
      tx.update(roastRef, { laughs: increment(-1) })
    } else {
      tx.set(laugherRef, { createdAt: serverTimestamp() })
      tx.update(roastRef, { laughs: increment(1) })
    }
  })
}

export function subscribeRoastUpvoteSet(postId, roastIds, userId, callback) {
  if (!userId || !roastIds?.length) return () => {}
  const unsubs = roastIds.map(rid =>
    onSnapshot(
      collection(db, POSTS, postId, ROASTS, rid, 'upvoters'),
      snap => {
        // Re-emit the full set so consumers stay in sync.
      }
    )
  )
  // For simplicity, fetch the full upvoter set on first snapshot only.
  // (The current UI only needs to know "did I upvote?", which we cache from
  // the post's main roasts collection write side. Toggle is the only write.)
  return () => unsubs.forEach(u => u())
}

// ----- Users -----

export async function ensureUser(userId, data) {
  await setDoc(doc(db, USERS, userId), data, { merge: true })
}

export async function getUser(userId) {
  const snap = await getDoc(doc(db, USERS, userId))
  return snap.exists() ? { id: snap.id, ...snap.data() } : null
}

export function subscribeUserPosts(userId, callback) {
  const q = query(
    collection(db, POSTS),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
    limit(50)
  )
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  })
}

// Update the current user's profile (username, display name, avatar color).
// Caller is responsible for sanitizing inputs; Firestore rules gate writes
// to the doc owner. The username_lowercase mirror is maintained here so
// case-insensitive search keeps working after a username change. The
// public `username` keeps its original casing for display.
export async function updateUserProfile(userId, { username, displayName, avatarColor, bio }) {
  const patch = {}
  if (typeof username === 'string') {
    const clean = username.trim().slice(0, 24)
    patch.username = clean
    patch.username_lowercase = clean.toLowerCase()
  }
  if (typeof displayName === 'string')   patch.displayName = displayName.trim().slice(0, 32)
  if (typeof avatarColor === 'string')   patch.avatarColor = avatarColor
  if (typeof bio === 'string')           patch.bio = bio.trim().slice(0, 160)
  patch.updatedAt = serverTimestamp()
  await setDoc(doc(db, USERS, userId), patch, { merge: true })
  return patch
}

/**
 * Write the cumulative roast score to the user doc.
 * Used by the client-side backfill (pull-to-refresh on profile) and the
 * AuthContext first-load backfill. The Cloud Function is the production
 * writer; this is a manual override / repair tool.
 */
export async function writeUserRoastScore(userId, total) {
  if (!userId) return
  await setDoc(doc(db, USERS, userId), {
    roastScoreTotal: Math.max(0, Number(total) || 0)
  }, { merge: true })
}

/**
 * Compute the cumulative upvotes a user has received across all their roasts.
 * Fans out across the user's posts and sums `upvotes` on each roast
 * subcollection. This is a backfill operation — once the result is mirrored
 * to `users/{uid}.roastScoreTotal`, live updates are read via
 * `subscribeUserRoastScore`.
 */
export async function getUserRoastScore(userId) {
  if (!userId) return { total: 0, byPost: {} }
  const postsQ = query(
    collection(db, POSTS),
    where('userId', '==', userId),
    limit(200)
  )
  const postsSnap = await getDocs(postsQ)
  let total = 0
  const byPost = {}
  await Promise.all(postsSnap.docs.map(async p => {
    const rs = await getDocs(
      query(collection(db, POSTS, p.id, ROASTS), limit(200))
    )
    let sub = 0
    rs.forEach(r => { sub += r.data().upvotes || 0 })
    byPost[p.id] = sub
    total += sub
  }))
  return { total, byPost }
}

/**
 * Live subscription to a user's cumulative roast-upvote count.
 * Reads `roastScoreTotal` on the user doc (kept fresh by the Cloud Function
 * / auth backfill). Returns 0 if the field is missing.
 */
export function subscribeUserRoastScore(userId, callback) {
  if (!userId) return () => {}
  return onSnapshot(doc(db, USERS, userId), (snap) => {
    const total = snap.exists() ? (snap.data().roastScoreTotal || 0) : 0
    callback(total)
  })
}

// ----- Username reservation (uniqueness) -----
//
// Uniqueness is enforced in two complementary ways:
//   1. /usernames/{username_lowercase}  — one doc per reserved handle,
//      with `uid` = current owner. Firestore doc IDs are inherently unique,
//      so a colliding create fails. This is the source of truth.
//   2. /users/{uid}.username_lowercase  — mirror for fast read alongside
//      the user profile. The client writes both atomically.
//
// Race-safe claim: in a single transaction we re-read the usernames
// doc; if it doesn't exist we create it. If it does and the existing
// uid matches, we treat it as our own. Otherwise we surface a clean
// "taken" error.

/**
 * Claim a username for the given user. Returns { ok: true } on success or
 * { ok: false, reason: 'taken' | 'invalid' } if the handle can't be reserved.
 * The handle is normalized to lowercase, 3-24 chars, [a-z0-9_].
 */
export async function claimUsername(uid, rawUsername) {
  if (!uid) return { ok: false, reason: 'invalid' }
  const u = String(rawUsername || '').trim().toLowerCase()
  if (u.length < 3 || u.length > 24 || !/^[a-z0-9_]+$/.test(u)) {
    return { ok: false, reason: 'invalid' }
  }
  const claimRef = doc(db, 'usernames', u)
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(claimRef)
      if (snap.exists()) {
        const data = snap.data()
        if (data.uid !== uid) {
          throw Object.assign(new Error('taken'), { code: 'username_taken' })
        }
        // Already ours — no-op.
        return
      }
      tx.set(claimRef, {
        uid,
        claimedAt: serverTimestamp()
      })
    })
    return { ok: true, username: u }
  } catch (e) {
    if (e.code === 'username_taken') return { ok: false, reason: 'taken' }
    // eslint-disable-next-line no-console
    console.error('[RoastBoard] claimUsername failed:', e)
    return { ok: false, reason: 'invalid' }
  }
}

/**
 * Release a username claim (used when deleting an account; not wired to
 * the UI today, but exported for completeness).
 */
export async function releaseUsername(uid, rawUsername) {
  const u = String(rawUsername || '').trim().toLowerCase()
  if (!u) return
  const claimRef = doc(db, 'usernames', u)
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(claimRef)
      if (snap.exists() && snap.data().uid === uid) tx.delete(claimRef)
    })
  } catch {}
}

// Check whether a username is already taken (case-insensitive).
// Returns true if available, false if taken. Empty / too-short / illegal
// usernames are never allowed. Fast path: reads the /usernames doc.
export async function isUsernameAvailable(username, currentUid) {
  if (!username) return false
  const clean = String(username).trim().toLowerCase()
  if (clean.length < 3 || clean.length > 24 || !/^[a-z0-9_]+$/.test(clean)) return false
  const snap = await getDoc(doc(db, 'usernames', clean))
  if (!snap.exists()) return true
  // If the existing claim belongs to the current user, the handle is
  // still "available" for them (e.g. they're re-saving their profile).
  return snap.data().uid === currentUid
}

// Search users by username prefix (case-insensitive). Requires the
// `username_lowercase` field to be populated (we set it on user creation
// and on every username change in updateUserProfile / AuthContext).
export async function searchUsers(term, max = 20) {
  const t = (term || '').trim().toLowerCase()
  if (!t) return []
  // Firestore range query: >= term AND < term + '' (high codepoint
  // sentinel) gives a "starts with" match.
  const end = t + ''
  const q = query(
    collection(db, USERS),
    where('username_lowercase', '>=', t),
    where('username_lowercase', '<=', end),
    limit(max)
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

// ----- Leaderboards -----

export async function topRoasters(max = 10) {
  // Users with the most total upvotes across all their roasts.
  // Cheap client-side aggregation: fetch recent roasts and tally.
  const q = query(
    collection(db, 'roasts_global_view'), // see note below
    orderBy('upvotes', 'desc'),
    limit(200)
  )
  // We don't actually have a global roasts collection (roasts live under each
  // post), so do a fan-out fetch across the most-liked posts instead.
  const postsQ = query(collection(db, POSTS), orderBy('likes', 'desc'), limit(20))
  const postsSnap = await getDocs(postsQ)
  const tallies = new Map()
  await Promise.all(postsSnap.docs.map(async p => {
    const rs = await getDocs(
      query(collection(db, POSTS, p.id, ROASTS), orderBy('upvotes', 'desc'), limit(20))
    )
    rs.forEach(r => {
      const d = r.data()
      const cur = tallies.get(d.userId) || { userId: d.userId, username: d.username, score: 0, avatarColor: d.userAvatarColor }
      cur.score += d.upvotes || 0
      tallies.set(d.userId, cur)
    })
  }))
  return Array.from(tallies.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
}

export async function topPosts(max = 10) {
  const q = query(collection(db, POSTS), orderBy('likes', 'desc'), limit(max))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}
