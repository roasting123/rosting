import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { friendlyAuthError } from '../authErrors.js'

export default function AuthPage() {
  const { signIn, signUp, signInWithGoogle } = useAuth()
  const nav = useNavigate()
  const [mode, setMode] = useState('signin') // signin | signup
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError(''); setBusy(true)
    try {
      if (mode === 'signup') {
        if (!email || !password) throw new Error('Email and password required.')
        if (password.length < 6) throw new Error('Password must be at least 6 characters.')
        await signUp(email, password, username || email.split('@')[0])
      } else {
        if (!email || !password) throw new Error('Email and password required.')
        await signIn(email, password)
      }
      nav('/')
    } catch (err) {
      setError(friendlyAuthError(err))
    } finally { setBusy(false) }
  }

  const google = async () => {
    setError(''); setBusy(true)
    try { await signInWithGoogle(); nav('/') }
    catch (err) {
      setError(friendlyAuthError(err))
    } finally { setBusy(false) }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="logo" style={{ justifyContent: 'center', marginBottom: 16 }}>
          <div className="logo-dot">🔥</div>
          RoastBoard
        </div>
        <div className="auth-title">
          {mode === 'signin' ? 'Welcome back' : 'Join the roast'}
        </div>
        <div className="auth-sub">
          {mode === 'signin'
            ? 'Sign in to roast & get roasted.'
            : 'Create an account to start roasting.'}
        </div>

        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={submit}>
          {mode === 'signup' && (
            <input
              className="auth-input"
              placeholder="Username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoComplete="username"
            />
          )}
          <input
            className="auth-input"
            placeholder="Email"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            autoComplete="email"
          />
          <input
            className="auth-input"
            placeholder="Password"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          />
          <button className="auth-btn" type="submit" disabled={busy}>
            {mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <button className="auth-btn google" onClick={google} disabled={busy}>
          <i className="ti ti-brand-google" style={{ fontSize: 16 }}></i>
          Continue with Google
        </button>

        <div className="auth-toggle">
          {mode === 'signin' ? (
            <>New here? <span onClick={() => setMode('signup')}>Create an account</span></>
          ) : (
            <>Already have an account? <span onClick={() => setMode('signin')}>Sign in</span></>
          )}
        </div>
      </div>
    </div>
  )
}
