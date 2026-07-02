// Translate Firebase auth error codes into friendly, human-readable messages.
// Keeps the auth UI free of raw "Firebase: Error (auth/whatever)" strings.

const MESSAGES = {
  // Most common user-facing errors
  'auth/configuration-not-found':
    "Login service isn't set up yet. The site owner needs to enable Email/Password and Google sign-in in the Firebase Console. Please try again in a few minutes.",
  'auth/invalid-api-key':
    'Invalid Firebase API key. Check your .env file — the value should start with "AIza...".',
  'auth/network-request-failed':
    "Network error — check your internet connection and try again.",
  'auth/too-many-requests':
    'Too many attempts. Please wait a minute and try again.',
  'auth/user-disabled':
    'This account has been disabled. Contact support.',
  'auth/user-not-found':
    "We couldn't find an account with that email.",
  'auth/wrong-password':
    'Wrong password. Try again or reset it.',
  'auth/invalid-credential':
    'Wrong email or password. Try again.',
  'auth/email-already-in-use':
    'An account with that email already exists. Try signing in instead.',
  'auth/invalid-email':
    "That email address doesn't look right.",
  'auth/weak-password':
    'Password is too weak. Use at least 6 characters.',
  'auth/popup-closed-by-user':
    'Sign-in popup was closed. Try again.',
  'auth/popup-blocked':
    'Popup was blocked by the browser. Allow popups for this site and retry.',
  'auth/cancelled-popup-request':
    'Sign-in was cancelled. Try again.',
  'auth/operation-not-allowed':
    'That sign-in method is disabled. Enable it in the Firebase Console.',
  'auth/unauthorized-domain':
    "This domain isn't authorized for sign-in. Add it under Firebase Auth → Settings → Authorized Domains.",
  'auth/missing-email': 'Enter your email address.',
  'auth/internal-error': 'Something went wrong on our end. Try again in a moment.'
}

export function friendlyAuthError(err) {
  if (!err) return 'Something went wrong. Try again.'
  const code = err.code || ''
  // Prefer the code-specific message, fall back to the raw error, then a generic fallback.
  if (MESSAGES[code]) return MESSAGES[code]
  const msg = (err.message || '').replace(/^Firebase:\s*/i, '').trim()
  return msg || 'Something went wrong. Try again.'
}
