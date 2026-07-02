// Small shared helpers used across screens.

export function timeAgo(ts) {
  if (!ts) return ''
  const d = ts.toDate ? ts.toDate() : (ts instanceof Date ? ts : new Date(ts))
  const sec = Math.floor((Date.now() - d.getTime()) / 1000)
  if (sec < 60)    return 'just now'
  if (sec < 3600)  return `${Math.floor(sec / 60)}m ago`
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`
  if (sec < 604800) return `${Math.floor(sec / 86400)}d ago`
  return d.toLocaleDateString()
}

// Deterministic pastel-ish color from any string (used for avatar background).
const PALETTE = [
  '#1f3a6e', '#7a3a00', '#3a1a5e', '#1a2e3a', '#0f3a20',
  '#2a0a2e', '#3a1010', '#1a1a3e', '#2e2a00', '#1a3a1a',
  '#3a2a1a', '#2a1a3a', '#3a1a1a', '#1a3a3a', '#3a3a1a'
]
export function colorFromString(s = '') {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return PALETTE[Math.abs(h) % PALETTE.length]
}

export function initialsFromName(name = '') {
  const parts = name.trim().split(/\s+|_|-/)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

// Pick a tag emoji for posts that have no real image (matches the prototype).
export function emojiForPost(post) {
  if (post?.emoji) return post.emoji
  const list = ['🤦', '💪', '💍', '🤳', '😂', '🫠', '🤡', '🥲', '😬', '🤨']
  const id = (post?.id || post?.caption || '').length
  return list[id % list.length]
}

/**
 * Roast tier — based on cumulative upvotes received across all roasts.
 * Tiers (per the product spec):
 *   <500           → 0 stars (none)
 *   500+           → 1 ⭐
 *
 * `isTop` is computed separately by the caller (it needs a global reference)
 * but currently unused — stars only depend on total likes.
 */
export function roastTier(total, isTop = false) {
  const t = Number(total) || 0
  if (t >= 500)      return { stars: 1, isTop: false, label: 'Roaster' }
  return { stars: 0, isTop: false, label: 'New' }
}
