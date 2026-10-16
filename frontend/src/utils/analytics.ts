/**
 * GA4 event helper. It only pushes onto the gtag queue that index.html sets
 * up on production (#314); there is no queue on previews or localhost, so
 * this is a no-op there. Never loads a script and never throws. No PII.
 */
export function trackEvent(name: string, params: Record<string, string>): void {
  try {
    window.gtag?.('event', name, params)
  } catch {
    // analytics must never break a click
  }
}
