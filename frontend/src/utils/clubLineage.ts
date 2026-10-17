import type { ClubDistrictHistoryClub } from '@taverns-red/shared-contracts'
import { lifecycleDistrictLabel } from './clubLifecycle'

/**
 * #1805 — the club hero's lineage chip (feature design §3.2/§4.3):
 * "District 201 (District 1 until June 2026)", from the club-district
 * history (#1782).
 *
 * The chip describes the districts the club was in BEFORE the page's
 * district: the spans preceding the latest span in the page district,
 * newest first, each "District N until <Month YYYY>" from the span's `to`
 * (its last sighting there) — or "until <Month D, YYYY>" when the span's
 * `lastSeenOn` dates it (#1816). A page district the history never lists says
 * nothing about districts — that is a pre-move page, which has its own
 * banner (#1804). Former names come with it, so a club that renamed but
 * never moved still shows them.
 *
 * Null (no chip) when there is nothing to say or no history.
 */
export interface ClubLineage {
  /** "District 1 until June 2026", newest first. */
  formerDistricts: string[]
  /** Earlier names, oldest first. */
  formerNames: string[]
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

/* String-parsed, never through Date, so a date cannot drift a time zone. */
function monthYear(iso: string | null): string | null {
  const m = /^(\d{4})-(\d{2})/.exec(iso ?? '')
  const month = m ? MONTHS[Number(m[2]) - 1] : undefined
  return m && month ? `${month} ${m[1]}` : null
}

/* "June 30, 2026" — only for a date the history vouches for (#1816). */
function dayMonthYear(iso: string | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '')
  const month = m ? MONTHS[Number(m[2]) - 1] : undefined
  return m && month ? `${month} ${Number(m[3])}, ${m[1]}` : null
}

/** "01" and "1" are one district; a lettered district compares as-is. */
function sameDistrict(a: string, b: string): boolean {
  const norm = (id: string) =>
    /^\d+$/.test(id) ? String(Number(id)) : id.toUpperCase()
  return norm(a) === norm(b)
}

export function buildClubLineage(
  history: ClubDistrictHistoryClub | null,
  districtId: string | undefined
): ClubLineage | null {
  if (!history || !districtId) return null
  const spans = history.spans
  let here = -1
  for (let i = spans.length - 1; i >= 0; i--) {
    if (sameDistrict(spans[i]!.districtId, districtId)) {
      here = i
      break
    }
  }
  const formerDistricts: string[] = []
  for (let i = here - 1; i >= 0; i--) {
    const span = spans[i]!
    // Consecutive spans in one district are one stay from the page's view.
    if (sameDistrict(span.districtId, districtId)) continue
    // The day when the history dates it (#1816), else the month of `to`.
    const until = dayMonthYear(span.lastSeenOn) ?? monthYear(span.to)
    const label = lifecycleDistrictLabel(span.districtId)
    formerDistricts.push(until ? `${label} until ${until}` : label)
  }
  const formerNames = history.formerNames
  // `here === -1` leaves formerDistricts empty: only names can be said.
  if (formerDistricts.length === 0 && formerNames.length === 0) return null
  return { formerDistricts, formerNames }
}
