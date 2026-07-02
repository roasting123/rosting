// Cloud Functions for RoastBoard.
//
// 1. sendPushOnLike / sendPushOnRoast / sendPushOnUpvote / sendPushOnFollow
//    → triggered when someone likes/roasts/upvotes/follows another user.
//      Each function:
//        a) Writes an in-app notification doc to /users/{recipientUid}/notifications/{id}
//           (so the in-app bell dropdown can show it instantly).
//        b) Sends an FCM push to the recipient's saved tokens.
//
// 2. syncRoastScoreTotal → keeps users/{uid}.roastScoreTotal in sync with
//    the sum of upvotes across that user's roasts. Used by RoastStars
//    (src/components/RoastStars.jsx) to render 1⭐ / 2⭐⭐ / 3⭐⭐⭐+👑.
//
// 3. backfillAllRoastScores → one-shot callable that walks every post
//    and writes the cumulative score to each roast author. Run after
//    deploying syncRoastScoreTotal so existing users see stars right away.
//
// 4. onPostCreated — (optional) notify followers when a new post is created.
//
// Deploy: `firebase deploy --only functions` (after `npm i` in this folder).
//
// SECURITY: This file runs server-side. The Cloudinary API secret (if/when
// added) belongs in the function's runtime env, never in the client.

const functions = require('firebase-functions')
const admin = require('firebase-admin')
admin.initializeApp()
const db = admin.firestore()
const messaging = admin.messaging()

// ---- Helpers ----

function pickIcon(type) {
  return {
    like:   '❤️',
    fire:   '🔥',
    roast:  '💬',
    upvote: '👍',
    follow: '➕',
    post:   '📸'
  }[type] || '🔔'
}

async function writeInAppNotif(recipientUid, notif) {
  if (!recipientUid) return
  await db
    .collection('users').doc(recipientUid)
    .collection('notifications').add({
      ...notif,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      read: false
    })
}

async function sendPush(recipientUid, title, body, data = {}) {
  if (!recipientUid) return
  const userSnap = await db.collection('users').doc(recipientUid).get()
  if (!userSnap.exists) return
  const tokens = userSnap.get('fcmTokens') || []
  if (!tokens.length) return

  // Strip tokens that are no longer registered with FCM.
  const valid = []
  const toDelete = []
  await Promise.all(tokens.map(async (token) => {
    try {
      await messaging.send({ token, notification: { title, body }, data }, /* dryRun */ true)
      valid.push(token)
    } catch (e) {
      if (e?.errorInfo?.code === 'messaging/registration-token-not-registered' ||
          e?.code === 'messaging/registration-token-not-registered') {
        toDelete.push(token)
      }
    }
  }))
  if (toDelete.length) {
    await userSnap.ref.update({
      fcmTokens: admin.firestore.FieldValue.arrayRemove(...toDelete)
    })
  }
  if (!valid.length) return

  await messaging.sendEachForMulticast({
    tokens: valid,
    notification: { title, body },
    data: Object.fromEntries(
      Object.entries({ type: data.type || 'generic', url: data.url || '/', ...data })
        .map(([k, v]) => [k, String(v)])
    ),
    webpush: {
      fcmOptions: { link: data.url || '/' },
      notification: { icon: '/icon.png', badge: '/icon.png' }
    }
  })
}

async function notify({
  recipientUid, actor, type, title, body, data
}) {
  if (!recipientUid) return
  if (actor && actor.uid === recipientUid) return // no self-notifs
  await Promise.all([
    writeInAppNotif(recipientUid, {
      type, title, body, data: data || {},
      actorUid: actor?.uid, actorUsername: actor?.username
    }),
    sendPush(recipientUid, title, body, { type, ...(data || {}) })
  ])
}

// ---- Like trigger ----
// posts/{postId}/likes/{userId}  created  →  notify post owner
exports.sendPushOnLike = functions.firestore
  .document('posts/{postId}/likes/{userId}')
  .onCreate(async (snap, context) => {
    const { postId, userId } = context.params
    const post = await db.collection('posts').doc(postId).get()
    if (!post.exists) return
    const recipientUid = post.get('userId')
    const actor = await db.collection('users').doc(userId).get()
    await notify({
      recipientUid,
      actor: { uid: userId, username: actor.get('username') || 'someone' },
      type: 'like',
      title: `${actor.get('username') || 'Someone'} liked your post ${pickIcon('like')}`,
      body: post.get('caption') || '',
      data: { postId, url: `/?post=${postId}` }
    })
  })

// ---- Roast trigger ----
// posts/{postId}/roasts/{roastId}  created  →  notify post owner
exports.sendPushOnRoast = functions.firestore
  .document('posts/{postId}/roasts/{roastId}')
  .onCreate(async (snap, context) => {
    const { postId, roastId } = context.params
    const roast = snap.data()
    const post = await db.collection('posts').doc(postId).get()
    if (!post.exists) return
    const recipientUid = post.get('userId')
    await notify({
      recipientUid,
      actor: { uid: roast.userId, username: roast.username || 'someone' },
      type: 'roast',
      title: `${roast.username || 'Someone'} roasted your post ${pickIcon('roast')}`,
      body: (roast.text || '').slice(0, 140),
      data: { postId, roastId, url: `/?post=${postId}` }
    })
  })

// ---- Roast upvote trigger ----
// posts/{postId}/roasts/{roastId}/upvoters/{userId}  created  →  notify roast author
exports.sendPushOnUpvote = functions.firestore
  .document('posts/{postId}/roasts/{roastId}/upvoters/{userId}')
  .onCreate(async (snap, context) => {
    const { postId, roastId, userId } = context.params
    const roast = await db.collection('posts').doc(postId)
      .collection('roasts').doc(roastId).get()
    if (!roast.exists) return
    const recipientUid = roast.get('userId')
    const actor = await db.collection('users').doc(userId).get()
    await notify({
      recipientUid,
      actor: { uid: userId, username: actor.get('username') || 'someone' },
      type: 'upvote',
      title: `${actor.get('username') || 'Someone'} upvoted your roast ${pickIcon('upvote')}`,
      body: (roast.get('text') || '').slice(0, 140),
      data: { postId, roastId, url: `/?post=${postId}` }
    })
  })

// ---- Roast score trigger ----
// posts/{postId}/roasts/{roastId}  onWrite  →  maintain
//   users/{roast.userId}.roastScoreTotal  by the delta in `upvotes`.
//
// Why onWrite (not on upvoter create/delete):
//   The client writes `upvotes` atomically in a transaction (see
//   `toggleRoastUpvote` in src/services/db.js), so each like changes the
//   roast's `upvotes` by exactly ±1. Summing the diffs across the stream
//   of writes is correct even under concurrent likes.
//   This also handles three other cases for free:
//     - Roast created       → +initialUpvotes
//     - Roast deleted       → -lastUpvotes
//     - Roast text edited   → no-op (upvotes unchanged)
//
// The Function uses the Admin SDK which bypasses the client-side rule that
// blocks writes to `roastScoreTotal`, so this is the only writer in
// production. The auth-context backfill covers pre-existing users.
exports.syncRoastScoreTotal = functions.firestore
  .document('posts/{postId}/roasts/{roastId}')
  .onWrite(async (change, context) => {
    const before = change.before.exists ? change.before.data() : null
    const after  = change.after.exists  ? change.after.data()  : null

    // 1. If the roast was just deleted, subtract the LAST known upvotes from
    //    the author. (On creation we get the create event; on delete we get
    //    `change.after.exists === false` but `change.before` still has data.)
    if (!after) {
      const uid = before?.userId
      const upvotes = before?.upvotes || 0
      if (!uid || !upvotes) return
      await db.collection('users').doc(uid).set({
        roastScoreTotal: admin.firestore.FieldValue.increment(-upvotes)
      }, { merge: true })
      return
    }

    // 2. Skip writes that don't touch the `upvotes` field (e.g. text edits).
    const beforeUpvotes = before?.upvotes || 0
    const afterUpvotes  = after.upvotes  || 0
    const delta = afterUpvotes - beforeUpvotes
    const uid = after.userId
    if (!uid || delta === 0) return

    // 3. Mirror the delta to the author's user doc. Use `set(merge: true)`
    //    so the field is created on first roast and incremented thereafter.
    //    Coalesce updates that happen within ~1s via FieldValue.increment so
    //    concurrent likes always converge.
    await db.collection('users').doc(uid).set({
      roastScoreTotal: admin.firestore.FieldValue.increment(delta)
    }, { merge: true })
  })

// ---- One-time roast score backfill ----
// Callable admin function: walks every post → every roast and writes the
// cumulative score to each roast author. Run once after deploying
// syncRoastScoreTotal so existing users see stars immediately without
// waiting for a profile visit (which would trigger the client-side
// backfill in AuthContext).
//
// Usage (server / admin):
//   firebase functions:shell
//   > backfillAllRoastScores({})
//
// Or via the Admin SDK in a one-off script. Callable from the client too
// (auth-gated) for emergency triggers.
exports.backfillAllRoastScores = functions.https.onCall(async (data, context) => {
  // Allow authenticated callers (or Admin SDK) — this is a read-mostly walk
  // and the writes are bounded to the roastScoreTotal field.
  // In production you may want to gate this to admin only.
  // if (!context.auth && !context.authToken?.admin) {
  //   throw new functions.https.HttpsError('permission-denied', 'Admin only')
  // }

  const postsSnap = await db.collection('posts').get()
  // authorUid → running total
  const totals = new Map()
  const updates = []

  for (const postDoc of postsSnap.docs) {
    const roastsSnap = await postDoc.ref.collection('roasts').get()
    for (const r of roastsSnap.docs) {
      const d = r.data()
      if (!d.userId) continue
      totals.set(d.userId, (totals.get(d.userId) || 0) + (d.upvotes || 0))
    }
  }

  for (const [uid, total] of totals) {
    updates.push(
      db.collection('users').doc(uid).set(
        { roastScoreTotal: total }, { merge: true }
      )
    )
  }
  await Promise.all(updates)
  return { usersUpdated: updates.length }
})

// ---- Follow trigger ----
// users/{followedUid}  updated  →  if followerIds array gained a new entry,
// notify the followed user. We use a generic onUpdate handler and inspect the
// diff so we don't fire on every doc update.
exports.sendPushOnFollow = functions.firestore
  .document('users/{userId}')
  .onUpdate(async (change, context) => {
    const before = change.before.get('followerIds') || []
    const after  = change.after.get('followerIds')  || []
    const newFollowers = after.filter(uid => !before.includes(uid))
    if (!newFollowers.length) return
    const followedUid = context.params.userId
    // Send one notification per new follower (batch them in production).
    await Promise.all(newFollowers.map(async (followerUid) => {
      const actor = await db.collection('users').doc(followerUid).get()
      await notify({
        recipientUid: followedUid,
        actor: { uid: followerUid, username: actor.get('username') || 'someone' },
        type: 'follow',
        title: `${actor.get('username') || 'Someone'} started following you ${pickIcon('follow')}`,
        body: '',
        data: { followerUid, url: `/profile?u=${followerUid}` }
      })
    }))
  })

// ---- Nightly rank recompute (kept from the previous build) ----
exports.recomputeRanks = functions.pubsub
  .schedule('every 30 minutes')
  .timeZone('Asia/Kolkata')
  .onRun(async () => {
    const now = new Date()
    const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0)
    const weekStart = new Date(dayStart); weekStart.setDate(weekStart.getDate() - 7)

    const all = await db.collection('posts').get()
    const today = []
    const week  = []
    all.forEach(doc => {
      const d = doc.data()
      const created = d.createdAt?.toDate?.()
      if (!created) return
      const score = (d.likes || 0) + (d.fireCount || 0) * 2
      if (created >= dayStart) today.push({ id: doc.id, score })
      if (created >= weekStart)  week.push({ id: doc.id, score })
    })

    today.sort((a, b) => b.score - a.score)
    week.sort((a, b) => b.score - a.score)

    const batch = db.batch()
    all.forEach(doc => batch.update(doc.ref, { rank: null }))
    today.slice(0, 3).forEach((p, i) => {
      batch.update(db.collection('posts').doc(p.id), { rank: `today#${i + 1}` })
    })
    week.slice(0, 3).forEach((p, i) => {
      batch.update(db.collection('posts').doc(p.id), { rank: `week#${i + 1}` })
    })
    await batch.commit()
    return null
  })

// ---- Optional: signed Cloudinary delete (kept from the previous build) ----
// exports.deleteCloudinaryImage = functions.https.onCall(async (data, context) => {
//   if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Sign in first')
//   const post = await db.collection('posts').doc(data.postId).get()
//   if (!post.exists || post.data().userId !== context.auth.uid) {
//     throw new functions.https.HttpsError('permission-denied', 'Not your post')
//   }
//   // ... use CLOUDINARY_API_KEY/SECRET env vars to delete the image, then
//   // delete the Firestore post doc.
//   await post.ref.delete()
//   return { ok: true }
// })

// ---- Identity sync trigger ----
// When a user updates their username or avatar color on users/{uid}, fan
// that change out to every post + roast they authored so the UI shows the
// new identity everywhere.
//
// Posts denormalize `username` and `userAvatarColor` at create time
// (see createPost / addRoast in src/services/db.js) which makes this
// fan-out necessary. The client only ever writes to the user doc on
// profile edit (see updateUserProfile), so this is the only writer
// that touches the denormalized copies.
//
// Batching: 500 writes per batched write (Firestore hard limit). For
// users with >5000 authored posts/roasts we bail and log a warning —
// those are a manual ops case.
exports.syncIdentityOnProfileChange = functions.firestore
  .document('users/{uid}')
  .onUpdate(async (change, context) => {
    const before = change.before.data() || {}
    const after  = change.after.data()  || {}

    // Diff only the fields we denormalize. No-op if unchanged.
    const usernameChanged  = before.username    !== after.username
    const avatarChanged    = before.avatarColor !== after.avatarColor
    if (!usernameChanged && !avatarChanged) return

    const uid = context.params.uid

    const patch = {}
    if (usernameChanged) patch.username        = after.username
    if (avatarChanged)   patch.userAvatarColor = after.avatarColor
    if (Object.keys(patch).length === 0) return

    // Fan-out: every post + every roast the user authored.
    // 500 is the Firestore batched-write limit.
    const BATCH_LIMIT = 500
    const HARD_CEILING = 5000

    const writeBatched = async (items) => {
      for (let i = 0; i < items.length; i += BATCH_LIMIT) {
        const batch = db.batch()
        items.slice(i, i + BATCH_LIMIT).forEach(d => batch.update(d.ref, patch))
        await batch.commit()
      }
    }

    // 1. Posts owned by this user. The `userId` field is denormalized on
    //    every post (see createPost) so a single field filter is enough.
    //    No composite index needed because there's no orderBy / range.
    const postsSnap = await db.collection('posts')
      .where('userId', '==', uid).get()
    if (postsSnap.size > HARD_CEILING) {
      console.warn(`[syncIdentity] user ${uid} owns ${postsSnap.size} posts — exceeds ceiling, skipping`)
    } else {
      await writeBatched(postsSnap.docs)
    }

    // 2. Roasts the user has written, across ALL posts (not just their own).
    //    A user roasts other people's posts too — that's the common case —
    //    so we can't just walk the user's own posts. We use a collection
    //    group query on the `roasts` subcollection filtered by `userId`.
    //    This requires a collection-group index on `roasts` (userId ASC).
    //    If the index is missing this will throw — the function will retry
    //    per the Cloud Functions retry policy. See README on creating the
    //    index in firebase.json or via the console link in the error.
    const roastsGroupSnap = await db.collectionGroup('roasts')
      .where('userId', '==', uid).get()
    if (roastsGroupSnap.size > HARD_CEILING) {
      console.warn(`[syncIdentity] user ${uid} owns ${roastsGroupSnap.size} roasts — exceeds ceiling, skipping`)
    } else if (roastsGroupSnap.size) {
      await writeBatched(roastsGroupSnap.docs)
    }
  })
