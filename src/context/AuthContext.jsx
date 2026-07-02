import { createContext, useContext, useEffect, useState } from 'react'
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut as fbSignOut,
  updateProfile as fbUpdateProfile
} from 'firebase/auth'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, googleProvider, db } from '../firebase'
import { enablePushForUser, listenForForegroundMessages }
  from '../notifications'
import { updateUserProfile, isUsernameAvailable, getUserRoastScore, claimUsername, releaseUsername } from '../services/db'

/**
 * Find a unique username by appending numeric suffixes if needed.
 * Strategy: try the raw candidate, then _2, _3, … up to 99.
 * If everything is taken, append 4 random hex chars.
 */
async function makeUniqueUsername(base) {
  const seed = (base || 'user')
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '')
    .toLowerCase()
    .slice(0, 18) || 'user'
  // First try the seed as-is
  if (await isUsernameAvailable(seed, null)) return seed
  // Then try seed_2, seed_3, … seed_99
  for (let i = 2; i < 100; i++) {
    const candidate = `${seed}_${i}`.slice(0, 24)
    if (await isUsernameAvailable(candidate, null)) return candidate
  }
  // Last resort — random suffix
  const rand = Math.floor(Math.random() * 0xffff).toString(16).padStart(4, '0')
  return `${seed.slice(0, 18)}_${rand}`
}

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u)
      if (u) {
        // Mirror into /users so we have a username + avatarColor + verified fields.
        const ref = doc(db, 'users', u.uid)
        const snap = await getDoc(ref)
        if (snap.exists()) {
          const existing = snap.data()
          // Backfill username_lowercase for users created before search existed.
          if (existing.username && !existing.username_lowercase) {
            await setDoc(ref, {
              username_lowercase: existing.username.toLowerCase()
            }, { merge: true })
            existing.username_lowercase = existing.username.toLowerCase()
          }
          // Backfill roastScoreTotal for users who had roasts before stars existed.
          // Fan-out is bounded (≤200 posts, ≤200 roasts each) so this is safe to run once.
          if (typeof existing.roastScoreTotal !== 'number') {
            try {
              const { total } = await getUserRoastScore(u.uid)
              if (total > 0) {
                await setDoc(ref, { roastScoreTotal: total }, { merge: true })
                existing.roastScoreTotal = total
              }
            } catch (e) {
              // Non-fatal — stars will just take longer to appear for this user.
              if (import.meta.env.DEV) console.warn('[RoastBoard] roastScore backfill failed:', e)
            }
          }
          setProfile({ id: u.uid, ...existing })
        } else {
          // Pick a base username from auth provider data, then resolve
          // collisions so the new account always has a unique handle
          // (case-insensitive). The current uid is null at creation time
          // (it's being written right now), so isUsernameAvailable treats
          // the candidate as taken if any user already has it.
          const baseUsername = (u.displayName || u.email?.split('@')[0] || 'user')
          const username = await makeUniqueUsername(baseUsername)
          // Reserve the handle in /usernames atomically. This is the
          // source of truth for "is X taken?". On a race we fall back
          // to a fresh suffix and try again.
          let claimed = await claimUsername(u.uid, username)
          if (!claimed.ok) {
            const retry = await makeUniqueUsername(`${username}_${Date.now() % 1000}`)
            claimed = await claimUsername(u.uid, retry)
          }
          const finalUsername = claimed.username || username
          const data = {
            username: finalUsername,
            username_lowercase: finalUsername.toLowerCase(),
            avatarColor: '#3a1a5e',
            verified: false,
            followerIds: [],
            fcmTokens: [],
            createdAt: serverTimestamp()
          }
          await setDoc(ref, data)
          setProfile({ id: u.uid, ...data })
        }
        // Ask for push permission + register FCM token. Safe no-op if denied.
        enablePushForUser(u.uid)
      } else {
        setProfile(null)
      }
      setLoading(false)
    })

    // Wire up foreground push handler (no-op if browser doesn't support FCM).
    const unsubMsg = listenForForegroundMessages((notif) => {
      // Foreground pushes also become in-app notifications because the
      // Cloud Function writes to /users/{uid}/notifications.
      // We just log here for visibility in dev.
      if (import.meta.env.DEV) console.info('[RoastBoard] foreground push:', notif)
    })
    return () => { unsub(); unsubMsg() }
  }, [])

  const signUp = async (email, password, username) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password)
    if (username) await updateProfile(cred.user, { displayName: username })
  }

  const signIn = (email, password) =>
    signInWithEmailAndPassword(auth, email, password)

  const signInWithGoogle = () => signInWithPopup(auth, googleProvider)

  const signOut = () => fbSignOut(auth)

  /**
   * Update the current user's profile (username, displayName, avatarColor, bio).
   * Username changes are atomic: we release the old /usernames claim
   * (if any) and acquire the new one inside a single transactional flow.
   * The user-doc patch only goes through if the claim succeeds, so the
   * mirror field and the source of truth can never disagree.
   */
  const updateProfile = async (patch) => {
    if (!user) throw new Error('Not signed in')
    const oldUsername = profile?.username
    const newUsername = patch.username ? String(patch.username).trim().toLowerCase() : null
    const usernameChanging = newUsername && newUsername !== (oldUsername || '').toLowerCase()

    // If username is changing, atomic claim. This both validates uniqueness
    // and writes the source-of-truth /usernames doc, so we can do the
    // user-doc update with confidence the handle is actually ours.
    if (usernameChanging) {
      const claim = await claimUsername(user.uid, newUsername)
      if (!claim.ok) {
        const e = new Error(claim.reason === 'taken'
          ? 'That username is already taken.'
          : 'Username must be 3-24 chars (letters, numbers, underscore).')
        e.code = claim.reason
        throw e
      }
    }

    // Mirror the new username into the lowercase field for search.
    // (updateUserProfile does the same, but doing it here too keeps the
    // local `profile` state immediately consistent.)
    const fullPatch = { ...patch }
    if (newUsername) fullPatch.username_lowercase = newUsername

    try {
      await updateUserProfile(user.uid, fullPatch)
    } catch (e) {
      // Roll back the claim if the user-doc write fails so the handle
      // doesn't get stuck reserved.
      if (usernameChanging) await releaseUsername(user.uid, newUsername)
      throw e
    }

    // Best-effort: release the old claim. If the old username equals the
    // new (shouldn't happen here), or the old was never claimed, the
    // helper no-ops.
    if (usernameChanging && oldUsername && oldUsername.toLowerCase() !== newUsername) {
      await releaseUsername(user.uid, oldUsername)
    }

    // Update Firebase Auth displayName too (for comment attribution).
    // We use the displayName if provided, otherwise the original-cased
    // username, never the lowercased mirror.
    const authName = fullPatch.displayName || fullPatch.username || user.displayName
    if (authName) {
      try { await fbUpdateProfile(user, { displayName: authName }) } catch {}
    }
    // Re-read the profile so the UI reflects the saved values.
    const snap = await getDoc(doc(db, 'users', user.uid))
    if (snap.exists()) setProfile({ id: user.uid, ...snap.data() })
  }

  return (
    <AuthContext.Provider
      value={{ user, profile, loading, signUp, signIn, signInWithGoogle, signOut, updateProfile }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
