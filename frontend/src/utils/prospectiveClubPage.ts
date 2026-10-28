import type {
  DistrictReportsDataset,
  ProspectiveClub,
} from '@taverns-red/shared-contracts'

/* #2303 — the in-site prospective club page,
   `/district/:id/growth/prospective/:clubId`. Red stub: the shapes only. */

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
      tiHref: string
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
      tiHref: string
    }

export function prospectiveClubHref(
  _districtId: string,
  _clubId: string
): string {
  return ''
}

export function parseProspectChecklist(
  _text: string,
  _asOfDate: string
): ChecklistStep[] | null {
  return null
}

export function buildProspectiveClubPage(_input: {
  districtId: string
  clubId: string
  reports: DistrictReportsDataset | null | undefined
  findAClub: readonly ProspectiveClub[] | undefined
  clubPageIds: ReadonlySet<string>
  asOfDate: string
}): ProspectiveClubPageModel {
  return { kind: 'unknown' }
}
