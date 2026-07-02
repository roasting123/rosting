import { roastTier } from '../utils.js'

/**
 * Renders the cumulative-roast-upvote tier badge for a user.
 * Only 1 star tier for now: 1 star when total >= 500, otherwise none.
 *
 * Props:
 *   userId   – whose score to render
 *   total    – pre-fetched total (optional; subscribes via parent if absent)
 *   compact  – true for inline use in search rows / leaderboard
 *   withLabel – show "1.2k likes · Roaster" text under the stars
 */
export default function RoastStars({
  userId,
  total = 0,
  compact = false,
  withLabel = false
}) {
  const { stars, label } = roastTier(total, false)
  if (stars === 0) return null

  return (
    <span
      className={`roast-stars ${compact ? 'compact' : ''} ${withLabel ? 'with-label' : ''}`}
      title={`${label} · ${total} roast likes`}
      aria-label={`${label} with ${total} roast likes`}
    >
      {stars >= 1 && (
        <i className="ti ti-star-filled star" aria-label="roaster star"></i>
      )}
      {withLabel && (
        <span className="rs-label">
          {total} roast {total === 1 ? 'like' : 'likes'} · {label}
        </span>
      )}
    </span>
  )
}
