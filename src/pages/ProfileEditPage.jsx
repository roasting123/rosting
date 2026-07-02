import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { colorFromString, initialsFromName } from '../utils.js'
import { isUsernameAvailable } from '../services/db.js'

// Curated palette for the avatar color picker. Mirrors colorFromString() in utils.
const AVATAR_COLORS = [
  '#1f3a6e', '#7a3a00', '#3a1a5e', '#1a2e3a', '#0f3a20',
  '#2a0a2e', '#3a1010', '#1a1a3e', '#2e2a00', '#1a3a1a',
  '#3a2a1a', '#2a1a3a', '#3a1a1a', '#1a3a3a', '#3a3a1a',
  '#ff4d00', '#ff5050', '#5b8fff', '#3ecf3e', '#ffb800'
]

export default function ProfileEditPage() {
  const { user, profile, updateProfile } = useAuth()
  const nav = useNavigate()

  const [username, setUsername]       = useState('')
  const [displayName, setDisplayName] = useState('')
  const [bio, setBio]                 = useState('')
  const [avatarColor, setAvatarColor] = useState('')
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState('')
  const [saved, setSaved]             = useState(false)
  // Live username-availability state: 'idle' | 'checking' | 'available' | 'taken' | 'invalid'
  const [usernameState, setUsernameState] = useState('idle')

  // Initialize from current profile.
  useEffect(() => {
    if (!profile) return
    setUsername(profile.username || '')
    setDisplayName(profile.displayName || profile.username || '')
    setBio(profile.bio || '')
    setAvatarColor(profile.avatarColor || colorFromString(user.uid))
  }, [profile, user])

  // Debounced live username-availability check.
  useEffect(() => {
    const u = username.trim().toLowerCase()
    // Same as current username? No need to check.
    if (u && profile?.username && u === profile.username.toLowerCase()) {
      setUsernameState('available')
      return
    }
    if (!u) { setUsernameState('idle'); return }
    if (u.length < 3) { setUsernameState('invalid'); return }
    if (!/^[a-z0-9_]+$/.test(u)) { setUsernameState('invalid'); return }
    setUsernameState('checking')
    const t = setTimeout(async () => {
      try {
        const ok = await isUsernameAvailable(u, user.uid)
        setUsernameState(ok ? 'available' : 'taken')
      } catch {
        setUsernameState('idle')
      }
    }, 350)
    return () => clearTimeout(t)
  }, [username, profile?.username, user?.uid])

  if (!user) {
    return (
      <div className="page">
        <div className="center-state">
          <i className="ti ti-user"></i>
          <div>Sign in to edit your profile.</div>
          <button className="nudge-btn" style={{ marginTop: 14 }} onClick={() => nav('/auth')}>Sign in</button>
        </div>
      </div>
    )
  }

  const av = avatarColor || colorFromString(user.uid)
  const avInit = initialsFromName(username || displayName || user.displayName)

  const onSave = async (e) => {
    e?.preventDefault()
    setError(''); setSaved(false)

    const u = username.trim().toLowerCase()
    if (!u) { setError('Username is required.'); return }
    if (u.length < 3) { setError('Username must be at least 3 characters.'); return }
    if (!/^[a-z0-9_]+$/.test(u)) {
      setError('Username can only contain letters, numbers, and underscores.')
      return
    }
    // Last-mile server check (the live one can be stale by the time we save).
    if (u !== (profile?.username || '').toLowerCase()) {
      const ok = await isUsernameAvailable(u, user.uid)
      if (!ok) { setError('That username is already taken.'); setUsernameState('taken'); return }
    }

    setSaving(true)
    try {
      await updateProfile({
        username: u,
        displayName: displayName.trim() || u,
        bio: bio.trim(),
        avatarColor: av
      })
      setSaved(true)
      setTimeout(() => nav('/profile'), 600)
    } catch (err) {
      setError(err.message?.replace('Firebase:', '').trim() || 'Could not save changes.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <button className="page-back" onClick={() => nav(-1)} aria-label="back">
          <i className="ti ti-arrow-left"></i>
        </button>
        <h2 className="page-title">Edit profile</h2>
      </div>

      <form className="edit-form" onSubmit={onSave}>
        <div className="edit-avatar-row">
          <div className="profile-av" style={{ background: av, width: 72, height: 72, fontSize: 22 }}>
            {avInit}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginBottom: 4 }}>
              Avatar color
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
              Choose a color others will see in your roasts.
            </div>
          </div>
        </div>

        <div className="color-grid">
          {AVATAR_COLORS.map(c => (
            <button
              key={c}
              type="button"
              className={`color-swatch ${av === c ? 'on' : ''}`}
              style={{ background: c }}
              onClick={() => setAvatarColor(c)}
              aria-label={`avatar color ${c}`}
            />
          ))}
        </div>

        <label className="edit-label">
          <span>Username</span>
          <input
            className="edit-input"
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value.replace(/\s+/g, '_').toLowerCase())}
            placeholder="your_handle"
            maxLength={24}
            autoComplete="username"
          />
          <small className="edit-hint">
            People can search for you using this.
            {usernameState === 'checking' && (
              <span className="uname-status checking"> · checking…</span>
            )}
            {usernameState === 'available' && (
              <span className="uname-status ok"> · ✓ available</span>
            )}
            {usernameState === 'taken' && (
              <span className="uname-status bad"> · ✗ already taken</span>
            )}
            {usernameState === 'invalid' && (
              <span className="uname-status bad"> · 3+ chars, letters/numbers/_</span>
            )}
          </small>
        </label>

        <label className="edit-label">
          <span>Display name</span>
          <input
            className="edit-input"
            type="text"
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            placeholder="SavageRavi"
            maxLength={32}
          />
          <small className="edit-hint">Optional. Shown next to your avatar.</small>
        </label>

        <label className="edit-label">
          <span>Bio</span>
          <textarea
            className="edit-input edit-textarea"
            value={bio}
            onChange={e => setBio(e.target.value)}
            placeholder="Savage roaster. 100% original. DMs open for collabs."
            maxLength={160}
          />
          <small className="edit-hint">{bio.length}/160</small>
        </label>

        {error && <div className="auth-error">{error}</div>}
        {saved && !error && (
          <div className="auth-success">Saved! Updating your name across all posts…</div>
        )}

        <button className="edit-save" type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </form>
    </div>
  )
}
