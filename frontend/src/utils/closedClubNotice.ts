import { formatLongDate } from './dateFormatting'

/**
 * #3104 — the line under a closed club's name on its club page. The wording
 * is pending Ron's OK: it lives here only, so a change is one edit.
 */
export function closedClubNotice(lastSeen: string): string {
  return `Closed, last on Toastmasters' list ${formatLongDate(lastSeen)}`
}
