import type { ClubDistrictHistoryClub } from '@taverns-red/shared-contracts'
import { lifecycleDistrictLabel } from './clubLifecycle'

/**
 * #1804 — which district a club was in for a program year, from the
 * club-district history (#1782), and how the club page says so when its URL
 * names another district (feature design §4.3).
 *
 * The history is program-year granular (Phase 1): `byProgramYear` holds the
 * district of the club's latest sighting that year, and a span's `to` is its
 * last sighting there. A move is therefore dated by what the data can vouch
 * for: "after June 30, 2026", the last record in the district it left.
 */

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

/** "01" and "1" are one district; a lettered id compares case-blind. */
export function sameDistrictId(a: string, b: string): boolean {
  const norm = (id: string) =>
    /^\d+$/.test(id) ? String(Number(id)) : id.toUpperCase()
  return norm(a) === norm(b)
}

/** The district the club was in for a PY label ("2024-2025"), or null. */
export function districtForProgramYear(
  history: ClubDistrictHistoryClub | null,
  programYearLabel: string
): string | null {
  return history?.byProgramYear[programYearLabel] ?? null
}

/** The district of the club's latest span. */
export function currentDistrictOf(
  history: ClubDistrictHistoryClub | null
): string | null {
  return history?.spans[history.spans.length - 1]?.districtId ?? null
}

/* String-parsed, never through Date, so the day cannot drift a time zone. */
function longDate(iso: string | null): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '')
  const month = m ? MONTHS[Number(m[2]) - 1] : undefined
  return m && month ? `${month} ${Number(m[3])}, ${m[1]}` : null
}

/**
 * When the club left `fromDistrictId` for `toDistrictId`: the last sighting
 * in the span right before the latest span in `toDistrictId` ("June 30,
 * 2026"). Null when the history shows no such move.
 */
export function movedAfterDate(
  history: ClubDistrictHistoryClub | null,
  fromDistrictId: string,
  toDistrictId: string
): string | null {
  const spans = history?.spans ?? []
  for (let i = spans.length - 1; i > 0; i--) {
    if (!sameDistrictId(spans[i]!.districtId, toDistrictId)) continue
    const prev = spans[i - 1]!
    return sameDistrictId(prev.districtId, fromDistrictId)
      ? longDate(prev.to)
      : null
  }
  return null
}

function lastSpanIndex(
  history: ClubDistrictHistoryClub,
  districtId: string
): number {
  for (let i = history.spans.length - 1; i >= 0; i--) {
    if (sameDistrictId(history.spans[i]!.districtId, districtId)) return i
  }
  return -1
}

/** "2024-2025" → "2024–25". */
function shortProgramYear(label: string): string {
  const m = /^(\d{4})-\d{2}(\d{2})$/.exec(label)
  return m ? `${m[1]}–${m[2]}` : label
}

export interface ClubDistrictNotice {
  headline: string
  detail: string
  openLabel: string
}

/**
 * The club page's banner when it shows `shownDistrictId`'s data under a URL
 * naming `urlDistrictId`:
 * - the shown district came first (a pre-move year): "In 2024–25 this club
 *   was in District 1.";
 * - the URL names the district the club left: "This club moved to District
 *   201 after June 30, 2026." (falls back to the "In …" wording when the
 *   history cannot date it).
 */
export function clubDistrictNotice(
  history: ClubDistrictHistoryClub | null,
  {
    urlDistrictId,
    shownDistrictId,
    programYearLabel,
  }: {
    urlDistrictId: string
    shownDistrictId: string
    programYearLabel: string
  }
): ClubDistrictNotice | null {
  if (!history || sameDistrictId(urlDistrictId, shownDistrictId)) return null
  const shown = lifecycleDistrictLabel(shownDistrictId)
  const py = shortProgramYear(programYearLabel)
  const movedAway =
    lastSpanIndex(history, shownDistrictId) >
    lastSpanIndex(history, urlDistrictId)
  const movedAfter = movedAway
    ? movedAfterDate(history, urlDistrictId, shownDistrictId)
    : null
  return {
    headline: movedAfter
      ? `This club moved to ${shown} after ${movedAfter}.`
      : `In ${py} this club was in ${shown}.`,
    detail: `Showing its ${shown} figures for ${py}.`,
    openLabel: `Open as ${shown}`,
  }
}
