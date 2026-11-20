import { formatLongDate } from './dateFormatting'

/**
 * #3104 — the line under a closed club's name on its club page, with the
 * last snapshot that listed the club. Wording approved by Ron on
 * 2026-11-20; it lives here only.
 */
export function closedClubNotice(lastSeen: string): string {
  return `Closed. Last on Toastmasters’ club list: ${formatLongDate(lastSeen)}`
}
