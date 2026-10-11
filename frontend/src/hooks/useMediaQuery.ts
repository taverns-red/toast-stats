import { useCallback, useSyncExternalStore } from 'react'

const hasMatchMedia = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'

/**
 * True while `query` matches. Read synchronously on first render (no flash
 * of the wrong layout) and kept in step with changes such as a phone
 * rotating. Where `matchMedia` is missing (some test DOMs) it returns false,
 * so the desktop layout renders. `useIsMobile` is the width-only shorthand.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!hasMatchMedia()) return () => {}
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    [query]
  )
  const getSnapshot = () =>
    hasMatchMedia() ? window.matchMedia(query).matches : false
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
