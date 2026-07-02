import { useEffect, useRef, useState, useCallback } from 'react'

/**
 * Pull-to-refresh — pointer-events-based so it works for touch, mouse, and
 * pen. Triggers `onRefresh` only when:
 *   1. The page is scrolled to the top (scrollTop <= 0 + tolerance)
 *   2. The user drags down past `threshold` (default 80px)
 *
 * Returns:
 *   { pull, refreshing, ptrHandlers, onScroll }  — spread ptrHandlers onto
 *   the scrollable container, attach onScroll to the same element, and
 *   render {pull} as the visual indicator inside that container.
 *
 * `pull` is the live pull distance (0 when idle). It includes a "ready to
 * release" flag via pull >= threshold. `refreshing` is true from release
 * until the onRefresh promise resolves.
 */
export function usePullToRefresh({ onRefresh, threshold = 80 } = {}) {
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const stateRef = useRef({
    startY: 0,
    active: false,
    pointerId: null,
    scrolled: false
  })

  // Re-arm after refresh completes.
  useEffect(() => {
    if (!refreshing) setPull(0)
  }, [refreshing])

  const onPointerDown = useCallback((e) => {
    if (refreshing) return
    // Only left-button for mouse.
    if (e.pointerType === 'mouse' && e.button !== 0) return
    stateRef.current.startY = e.clientY
    stateRef.current.active = true
    stateRef.current.pointerId = e.pointerId
    stateRef.current.scrolled = false
  }, [refreshing])

  const onPointerMove = useCallback((e) => {
    const s = stateRef.current
    if (!s.active || s.pointerId !== e.pointerId) return
    if (e.pointerType === 'mouse' && (e.buttons & 1) === 0) {
      // mouse button released without an up event we got — abort
      s.active = false
      return
    }
    const dy = e.clientY - s.startY
    if (dy <= 0) {
      if (pull !== 0) setPull(0)
      return
    }
    // Apply a soft resistance curve so 250px of finger drag → ~80px of pull.
    const resisted = Math.min(threshold * 1.6, dy * 0.4)
    setPull(resisted)
  }, [pull, threshold])

  const release = useCallback(async () => {
    const s = stateRef.current
    if (!s.active) return
    s.active = false
    s.pointerId = null
    const dist = pull
    if (dist >= threshold && !refreshing && onRefresh) {
      setRefreshing(true)
      // Snap to the threshold while the spinner is active.
      setPull(threshold)
      try {
        await onRefresh()
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[usePullToRefresh] onRefresh threw:', err)
      } finally {
        setRefreshing(false)
      }
    } else {
      setPull(0)
    }
  }, [pull, threshold, refreshing, onRefresh])

  const onPointerUp = useCallback((e) => {
    const s = stateRef.current
    if (s.pointerId !== e.pointerId) return
    release()
  }, [release])

  const onPointerCancel = useCallback((e) => {
    const s = stateRef.current
    if (s.pointerId !== e.pointerId) return
    s.active = false
    s.pointerId = null
    setPull(0)
  }, [])

  // Guard: only count a pull when the scrollable container is at the top.
  // The host attaches `onScroll` to its scroller and we read scrollTop.
  const scrollTopRef = useRef(0)
  const onScroll = useCallback((e) => {
    scrollTopRef.current = e.currentTarget.scrollTop
    if (stateRef.current.active && scrollTopRef.current > 1 && pull > 0) {
      // User scrolled away mid-pull — abort.
      stateRef.current.active = false
      stateRef.current.pointerId = null
      setPull(0)
    }
  }, [pull])

  return {
    pull,
    refreshing,
    ready: pull >= threshold,
    // Attach these to the scrollable element.
    ptrHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel
    },
    onScroll
  }
}

/**
 * Small visual element that hooks the usePullToRefresh state to the DOM.
 * Renders a translucent strip that drops down with a spinner, and
 * disappears when idle.
 */
export function PullToRefreshIndicator({ pull, refreshing, ready, threshold = 80 }) {
  // Don't render anything when fully idle.
  if (pull === 0 && !refreshing) return null
  // Translate the strip down by the pull distance (or threshold while refreshing).
  const dist = refreshing ? threshold : pull
  return (
    <div
      className={`ptr-indicator ${ready ? 'ready' : ''} ${refreshing ? 'refreshing' : ''}`}
      style={{ transform: `translateY(${dist}px)`, opacity: refreshing ? 1 : Math.min(1, pull / threshold) }}
      aria-hidden="true"
    >
      <div className="ptr-spinner">
        <i className={`ti ${refreshing ? 'ti-loader' : 'ti-arrow-down'}`}></i>
      </div>
    </div>
  )
}
