import {
  normalizeClubId,
  parseProspectChecklist as readChecklist,
  type DistrictReportsDataset,
  type ProspectChecklistItem,
  type ProspectChecklistStatus,
  type ProspectiveClub,
} from '@taverns-red/shared-contracts'
import { daysBetween, prospectiveClubHref } from './clubGrowthFunnel'
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

export type ChecklistStatus = ProspectChecklistStatus

export interface ChecklistStep extends ProspectChecklistItem {
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

export { prospectiveClubHref }

/**
 * TI's `Prospect` cell as the full checklist — the shared reading
 * (`parseProspectChecklist`, #2388) the funnel and the rollups also use —
 * with each step's days since it last changed, as of the displayed date.
 */
export function parseProspectChecklist(
  text: string,
  asOfDate: string
): ChecklistStep[] | null {
  const checklist = readChecklist(text)
  if (!checklist) return null
  return checklist.map(s => ({
    ...s,
    daysSince: s.date ? daysBetween(s.date, asOfDate) : null,
  }))
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
