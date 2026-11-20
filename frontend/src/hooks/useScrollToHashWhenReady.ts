import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/** #3094 — scroll to the URL hash's target once the page says it is ready.
 *
 *  `useScrollRestoration` tries the hash on navigation, but a page whose
 *  sections render after its data loads (`/district/61/growth#growth-reinstate`
 *  from the region and world funnels) has no target yet, so the router lands
 *  at the top. Same pattern as the Education page's anchors. */
export function useScrollToHashWhenReady(ready: boolean): void {
  const { hash } = useLocation()
  useEffect(() => {
    if (!ready || !hash) return
    let id: string
    try {
      id = decodeURIComponent(hash.slice(1))
    } catch {
      return
    }
    document.getElementById(id)?.scrollIntoView?.({ block: 'start' })
  }, [ready, hash])
}
