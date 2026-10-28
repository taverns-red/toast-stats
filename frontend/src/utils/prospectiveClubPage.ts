import {
  normalizeClubId,
  type DistrictReportsDataset,
  type ProspectiveClub,
} from '@taverns-red/shared-contracts'
import {
  daysBetween,
  prospectiveClubHref,
  usDateToIso,
} from './clubGrowthFunnel'
import { toastmastersClubPageUrl } from './toastmastersClubPageUrl'

/* #2303 — the in-site prospective club page,
   `/district/:id/growth/prospective/:clubId`.

   Two sources, both already on the CDN for the displayed date (R3):
   - the reports sidecar's `prospectiveClubs` (TI's Prospective Clubs report)
     for the club's name, division/area and the `Prospect` checklist cell;
   - the analytics file's `prospectiveClubs` (Find-a-Club, #489) for the
     place: city, region and country only.

   The `Prospect` cell is a checklist, not a ladder: TI prints each step with
   Complete/Incomplete and the date it last changed, steps complete out of
   order, and a step can go back to Incomplete (spike 2026-10-28, D25/D84).
   So the page lists every step on its own and never infers a "current
   stage" — the funnel keeps its #2142 furthest-step rule.

   Privacy: the report's free-text `location` (may hold a person's name or a
   home address), Find-a-Club's optional `website` (may be a person's
   profile) and meeting times never enter the model, so no view can render
   them. */

export type ChecklistStatus = 'complete' | 'incomplete' | 'not-listed'

export interface ChecklistStep {
  /** `1`–`6`, or `payment`. */
  key: string
  /** TI's step name. */
  label: string
  /** The step number TI prints (`#N`); null for Payment. */
  number: number | null
  status: ChecklistStatus
  /** ISO date the step last changed, when TI prints one. */
  date: string | null
  /** Days from `date` to the displayed snapshot date. */
  daysSince: number | null
}

export type ProspectiveClubPageModel =
  | { kind: 'unknown' }
  | {
      kind: 'not-found'
      clubId: string
      /** The club's page here, when it is in this date's club list. */
      clubHref: string | null
      /** TI's club page; null for an id TI's URL cannot carry. */
      tiHref: string | null
    }
  | {
      kind: 'found'
      clubId: string
      clubName: string
      division: string
      area: string
      /** City, region and country from Find-a-Club, never the report text. */
      place: string | null
      /** Null when TI's text is not the `#N …` checklist. */
      checklist: ChecklistStep[] | null
      rawProspect: string
      /** TI's own "as of" for the Prospective Clubs report. */
      reportAsOf: string | null
      /** TI's club page; null for an id TI's URL cannot carry. */
      tiHref: string | null
    }

/** TI's charter steps, in TI's numbering (recorded vocabulary, #2142). */
const STEPS: readonly { number: number; label: string }[] = [
  { number: 1, label: 'Application to Organize' },
  { number: 2, label: 'Certificate & Remit' },
  { number: 3, label: 'Roster' },
  { number: 4, label: 'Officer Info' },
  { number: 5, label: 'Club Info' },
  { number: 6, label: 'Constitution & Bylaws' },
]

export { prospectiveClubHref }

function statusOf(text: string): 'complete' | 'incomplete' | null {
  // "Incomplete" contains "complete", so test it first.
  if (/\bIncomplete\b/.test(text)) return 'incomplete'
  if (/\bComplete\b/.test(text)) return 'complete'
  return null
}

function step(
  key: string,
  label: string,
  number: number | null,
  text: string | undefined,
  asOfDate: string
): ChecklistStep {
  const status = text === undefined ? null : statusOf(text)
  const date = text === undefined ? null : usDateToIso(text)
  return {
    key,
    label,
    number,
    status: status ?? 'not-listed',
    date: status ? date : null,
    daysSince: status && date ? daysBetween(date, asOfDate) : null,
  }
}

/**
 * Read TI's `Prospect` cell as the full checklist: steps #1–#6 and Payment,
 * each Complete, Incomplete or not listed, with the date it last changed.
 * Null for text that does not start with `#N`. String operations only — a
 * backtracking regex over this cell is polynomial on whitespace runs.
 */
export function parseProspectChecklist(
  text: string,
  asOfDate: string
): ChecklistStep[] | null {
  const paymentAt = text.search(/Payment\b/)
  const stepPart = (paymentAt >= 0 ? text.slice(0, paymentAt) : text).trim()
  const paymentPart = paymentAt >= 0 ? text.slice(paymentAt) : undefined
  if (!/^#\d+\s/.test(stepPart)) return null

  const starts: number[] = []
  for (const m of stepPart.matchAll(/#\d+\s/g)) starts.push(m.index)
  const byNumber = new Map<number, string>()
  for (let i = 0; i < starts.length; i++) {
    const segment = stepPart.slice(starts[i], starts[i + 1] ?? stepPart.length)
    const n = Number(/^#(\d+)/.exec(segment)![1])
    if (!byNumber.has(n)) byNumber.set(n, segment)
  }

  return [
    ...STEPS.map(s =>
      step(
        String(s.number),
        s.label,
        s.number,
        byNumber.get(s.number),
        asOfDate
      )
    ),
    step('payment', 'Payment', null, paymentPart, asOfDate),
  ]
}

function placeOf(club: ProspectiveClub | undefined): string | null {
  if (!club) return null
  const parts = [club.city, club.region, club.country].filter(
    (p): p is string => typeof p === 'string' && p.trim() !== ''
  )
  return parts.length > 0 ? parts.join(', ') : null
}

export function buildProspectiveClubPage({
  districtId,
  clubId,
  reports,
  findAClub,
  clubPageIds,
  asOfDate,
}: {
  districtId: string
  clubId: string
  reports: DistrictReportsDataset | null | undefined
  findAClub: readonly ProspectiveClub[] | undefined
  clubPageIds: ReadonlySet<string>
  asOfDate: string
}): ProspectiveClubPageModel {
  const section = reports?.sections?.prospectiveClubs
  if (!section) return { kind: 'unknown' }

  const id = normalizeClubId(clubId)
  const tiHref = toastmastersClubPageUrl(clubId)
  const record = section.records.find(r => normalizeClubId(r.club) === id)
  if (!record) {
    return {
      kind: 'not-found',
      clubId,
      clubHref: clubPageIds.has(id)
        ? `/district/${districtId}/club/${clubId}`
        : null,
      tiHref,
    }
  }

  const fac = findAClub?.find(c => normalizeClubId(c.clubId) === id)
  return {
    kind: 'found',
    clubId,
    clubName: record.name,
    division: record.division,
    area: record.area,
    place: placeOf(fac),
    checklist: parseProspectChecklist(record.prospect, asOfDate),
    rawProspect: record.prospect,
    reportAsOf: section.sources.find(s => s.asOf)?.asOf || null,
    tiHref,
  }
}
