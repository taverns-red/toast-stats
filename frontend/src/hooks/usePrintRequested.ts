import { useEffect, useState } from 'react'

/**
 * True once the reader has asked to print the page (#2571). Latched, like
 * `useNearViewport`: it never turns false again, so a read it releases is
 * started at most once.
 *
 * Cards that hold their read until they near the viewport (#2513) are still
 * in `print.css`'s printout, so an unscrolled Cmd-P would print their
 * placeholders. `beforeprint` is the signal in most browsers; the `print`
 * media query changing covers the ones that skip the event (Safari fires it
 * only on some paths).
 */
export function usePrintRequested(): boolean {
  const [requested, setRequested] = useState(false)

  useEffect(() => {
    if (requested) return
    const request = () => setRequested(true)
    window.addEventListener('beforeprint', request)
    const mql =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('print')
        : null
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) request()
    }
    mql?.addEventListener?.('change', onChange)
    return () => {
      window.removeEventListener('beforeprint', request)
      mql?.removeEventListener?.('change', onChange)
    }
  }, [requested])

  return requested
}
