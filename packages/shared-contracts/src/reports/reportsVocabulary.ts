/**
 * TI's daily-reports vocabulary (#2012): how the free-text cells of
 * `snapshots/{date}/district_{id}_reports.json` read as states.
 *
 * One home for the rules, so the frontend's per-district views (club growth
 * funnel #1794, compliance #1954) and the pipeline's region/world rollups
 * (`reports-rollups.json`) cannot read the same cell two ways — a region
 * total must equal the district pages it sums.
 *
 * Recorded live vocabulary (D61, prod 2026-10-15):
 * - Prospect: `#1 Application to Organize Complete - 04/15/2025` followed,
 *   with no separator once the `<br>` is stripped, by `Payment Complete -
 *   04/19/2025` or `Payment Incomplete`.
 * - Dues renewal: `Verified complete - 08/03/2026`, `**Renewals not here**`,
 *   `Low - Minimum requirement not yet met`, `Ineligible - Minimum
 *   requirement not yet met`.
 * - Sponsors & mentors codes: `SPONSOR`, `MENTOR`, `MENTORU` (`SPONSORU` by
 *   the same rule).
 * Text outside the vocabulary is kept as "unrecognised" / "other", never
 * guessed at.
 *
 * @module reportsVocabulary
 */

const US_DATE = /(\d{1,2})\/(\d{1,2})\/(\d{4})/

/** MM/DD/YYYY → YYYY-MM-DD, or null when the text holds no such date. */
export function usDateToIso(text: string): string | null {
  const m = US_DATE.exec(text)
  if (!m) return null
  const [, mm, dd, yyyy] = m
  return `${yyyy}-${mm!.padStart(2, '0')}-${dd!.padStart(2, '0')}`
}

export type ParsedProspectStage =
  | {
      recognised: true
      stageNumber: number
      stageLabel: string
      /** ISO date the stage was completed, when TI prints one. */
      stageDate: string | null
      payment: 'complete' | 'incomplete' | 'unknown'
      paymentDate: string | null
      raw: string
    }
  | { recognised: false; raw: string }

/**
 * Parse TI's "Prospect" cell. Text that does not start with `#N` is returned
 * raw rather than guessed at.
 */
export function parseProspectStage(text: string): ParsedProspectStage {
  const raw = text
  const paymentAt = text.search(/Payment\b/)
  const stagePart = (paymentAt >= 0 ? text.slice(0, paymentAt) : text).trim()
  const paymentPart = paymentAt >= 0 ? text.slice(paymentAt) : ''

  const stage =
    /^#(\d+)\s+(.+?)(?:\s+(?:Complete|Incomplete))?(?:\s*-\s*\d{1,2}\/\d{1,2}\/\d{4})?$/.exec(
      stagePart
    )
  if (!stage) return { recognised: false, raw }

  let payment: 'complete' | 'incomplete' | 'unknown' = 'unknown'
  let paymentDate: string | null = null
  if (/^Payment\s+Complete/.test(paymentPart)) {
    payment = 'complete'
    paymentDate = usDateToIso(paymentPart)
  } else if (/^Payment\s+Incomplete/.test(paymentPart)) {
    payment = 'incomplete'
  }

  return {
    recognised: true,
    stageNumber: Number(stage[1]),
    stageLabel: stage[2]!.trim(),
    stageDate: usDateToIso(stagePart),
    payment,
    paymentDate,
    raw,
  }
}

export type SponsorMentorRole = 'sponsors' | 'mentors' | 'other'

/**
 * TI's New Club Sponsors & Mentors codes → role. A trailing U (`SPONSORU`,
 * `MENTORU`) marks a credit the member already used toward a DTM (confirmed
 * by Ron on PR #2065); the role is the same, so it counts the same.
 */
const SPONSOR_MENTOR_ROLES: Readonly<Record<string, SponsorMentorRole>> = {
  SPONSOR: 'sponsors',
  SPONSORU: 'sponsors',
  MENTOR: 'mentors',
  MENTORU: 'mentors',
}

/** The role of a sponsors/mentors code; any unlisted code is 'other'. */
export function sponsorMentorRole(code: string): SponsorMentorRole {
  return SPONSOR_MENTOR_ROLES[code.trim().toUpperCase()] ?? 'other'
}

export type DuesRenewalState =
  'verified' | 'notReceived' | 'low' | 'ineligible' | 'notYetDue' | 'other'

/**
 * One club's dues-renewal state for a period. A "Verified complete" record
 * counts for this program year only if it was verified inside the window
 * that period's payments fall in (October: from 1 June of the PY's first
 * year; April: from 1 December) — the report keeps last period's
 * verification until the new one arrives (D61, October 2026: the April
 * report still showed January 2026). Before 1 January of the PY's second
 * year, April dues are not yet due.
 */
export function classifyDuesRenewal(input: {
  status: string
  season: 'october' | 'april'
  /** `YYYY-YYYY`. */
  programYear: string
  /** The snapshot's logical date, `YYYY-MM-DD`. */
  snapshotDate: string
}): DuesRenewalState {
  const startYear = Number.parseInt(input.programYear.slice(0, 4), 10)
  if (
    input.season === 'april' &&
    input.snapshotDate < `${startYear + 1}-01-01`
  ) {
    return 'notYetDue'
  }
  const windowStart =
    input.season === 'october' ? `${startYear}-06-01` : `${startYear}-12-01`
  const status = input.status
  if (/^verified complete/i.test(status)) {
    const iso = usDateToIso(status)
    return iso && iso >= windowStart ? 'verified' : 'notReceived'
  }
  if (/^ineligible/i.test(status)) return 'ineligible'
  if (/^low/i.test(status)) return 'low'
  if (/not here/i.test(status)) return 'notReceived'
  return 'other'
}
