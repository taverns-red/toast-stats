import { useEffect, useState } from 'react'

/**
 * True from the first idle period after `enabled` turns true (#2427), and
 * latched from then on. For below-the-fold work that must not compete with
 * the first paint or LCP — e.g. loading a lazy chunk the reader may never
 * scroll to. Without `requestIdleCallback` (Safari) it waits `timeoutMs`;
 * with it, `timeoutMs` is the latest it waits.
 */
export function useAfterIdle(enabled: boolean, timeoutMs = 2000): boolean {
  const [idle, setIdle] = useState(false)

  useEffect(() => {
    if (!enabled || idle) return
    const done = () => setIdle(true)
    if (typeof requestIdleCallback === 'function') {
      const id = requestIdleCallback(done, { timeout: timeoutMs })
      return () => cancelIdleCallback(id)
    }
    const id = setTimeout(done, timeoutMs)
    return () => clearTimeout(id)
  }, [enabled, idle, timeoutMs])

  return idle
}
