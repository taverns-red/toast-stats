import type {
  CoachRecord,
  DistrictReportsDataset,
  NewClubRecord,
  ProspectiveClubRecord,
} from '@taverns-red/shared-contracts'
import { toastmastersClubPageUrl } from './toastmastersClubPageUrl'

/* District Club Growth funnel (#1794, epic #1781).

   Four stages, each from data already on the CDN — no new pipeline field:

   - Prospective  — the reports sidecar's `prospectiveClubs` (TI's Prospective
     Clubs report). Its `prospect` text carries the stage and dates.
   - Chartered    — the rankings row's `newCharteredClubs` (TI's dashboard
     count, the same one the Club Growth award reads); the clubs come from the
     sidecar's `newClubs` report, scoped to the program year.
   - Coached      — the sidecar's `coaches` report: distinct clubs with an
     active (PENDING) coach, plus completed (AWARDED) assignments.
   - Suspended    — the rankings row's `suspendedClubs`. Count only: no
     per-club suspension list reaches the CDN today (a pipeline field).

   A stage whose source is missing is UNKNOWN, never 0 (#1757). Privacy: the
   sidecar is already de-identified at parse; this model keeps only club ids,
   club names, dates and statuses — never a person, email or phone. */

export type StageValue =
  { kind: 'count'; value: number } | { kind: 'unknown'; reason: string }

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

const US_DATE = /(\d{1,2})\/(\d{1,2})\/(\d{4})/

/** MM/DD/YYYY → YYYY-MM-DD, or null when the text holds no such date. */
export function usDateToIso(text: string): string | null {
  const m = US_DATE.exec(text)
  if (!m) return null
  const [, mm, dd, yyyy] = m
  return `${yyyy}-${mm!.padStart(2, '0')}-${dd!.padStart(2, '0')}`
}

/**
 * Parse TI's "Prospect" cell. Recorded live vocabulary (D61, 2026-06-01 and
 * 2026-10-11): `#1 Application to Organize Complete - 04/15/2025` followed —
 * with no separator once the `<br>` is stripped — by `Payment Complete -
 * 04/19/2025` or `Payment Incomplete`. Text that does not start with `#N` is
 * returned raw rather than guessed at.
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

/** Whole calendar days from `from` to `to` (both YYYY-MM-DD), timezone-free. */
export function daysBetween(from: string, to: string): number {
  const utc = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number)
    return Date.UTC(y!, m! - 1, d!)
  }
  return Math.round((utc(to) - utc(from)) / 86_400_000)
}

// ─── Rankings counts ────────────────────────────────────────────────────────

export interface GrowthCounts {
  /** Clubs chartered this program year; null = unknown. */
  chartered: number | null
  /** Clubs suspended this program year; null = unknown (#1757). */
  suspended: number | null
}

interface RankingCountsRow {
  districtId: string
  newCharteredClubs?: number | undefined
  suspendedClubs?: number | undefined
}

/** Same floor as the Club Growth award's census check (#1501). */
const CENSUS_ROW_FLOOR = 50

/**
 * True when a census-sized rankings file carries the field on every row and
 * not one is positive: the source column was absent, so the 0s mean "not
 * collected" (#1501 for charters, #1757 for suspensions) — not a measured 0.
 */
function isCensusZero(
  rankings: readonly RankingCountsRow[],
  field: 'newCharteredClubs' | 'suspendedClubs'
): boolean {
  let present = 0
  for (const r of rankings) {
    const v = r[field]
    if (typeof v !== 'number') continue
    if (v > 0) return false
    present += 1
  }
  return present >= CENSUS_ROW_FLOOR
}

/** Read the district's charter + suspension counts from one rankings file. */
export function readGrowthCounts(
  rankings: readonly RankingCountsRow[],
  districtId: string
): GrowthCounts {
  const row = rankings.find(r => r.districtId === districtId)
  const read = (field: 'newCharteredClubs' | 'suspendedClubs') => {
    const v = row?.[field]
    if (typeof v !== 'number') return null
    return isCensusZero(rankings, field) ? null : v
  }
  return {
    chartered: read('newCharteredClubs'),
    suspended: read('suspendedClubs'),
  }
}

// ─── The funnel ─────────────────────────────────────────────────────────────

export interface ProspectiveRow {
  clubId: string
  clubName: string
  division: string
  area: string
  stage: ParsedProspectStage
  /** Days since the stage date, as of the displayed snapshot. */
  daysInStage: number | null
  payment: 'complete' | 'incomplete' | 'unknown'
  /** TI's public club page — a prospective club has no page here yet. */
  href: string | null
}

export interface CharteredRow {
  clubId: string
  clubName: string
  division: string
  area: string
  charterDate: string
  href: string
}

export interface CoachedRow {
  clubId: string
  clubName: string
  /** ISO begin date of the coach assignment. */
  since: string | null
  status: 'active' | 'completed'
  href: string
}

export interface ClubGrowthFunnel {
  prospective: {
    value: StageValue
    clubs: ProspectiveRow[]
    byStage: { stageNumber: number | null; stageLabel: string; count: number }[]
  }
  chartered: { value: StageValue; clubs: CharteredRow[] }
  coached: { value: StageValue; active: CoachedRow[]; completed: CoachedRow[] }
  suspended: { value: StageValue }
}

export interface BuildClubGrowthFunnelInput {
  /** The page's district (R3) — never read back from the response. */
  districtId: string
  reports: DistrictReportsDataset | null | undefined
  counts: GrowthCounts
  /** The displayed program year (R3 — passed from the page, not derived). */
  programYear: { startDate: string; endDate: string }
  /** The displayed snapshot date. */
  asOfDate: string
}

const NO_REPORT = 'Not in this date’s TI reports'
const NOT_COLLECTED = 'Not reported by TI for this date'

function clubHref(districtId: string, clubId: string): string {
  return `/district/${districtId}/club/${clubId}`
}

function buildProspective(
  records: readonly ProspectiveClubRecord[],
  asOfDate: string
): ClubGrowthFunnel['prospective'] {
  const clubs: ProspectiveRow[] = records.map(r => {
    const stage = parseProspectStage(r.prospect)
    const stageDate = stage.recognised ? stage.stageDate : null
    return {
      clubId: r.club,
      clubName: r.name,
      division: r.division,
      area: r.area,
      stage,
      daysInStage: stageDate ? daysBetween(stageDate, asOfDate) : null,
      payment: stage.recognised ? stage.payment : 'unknown',
      href: toastmastersClubPageUrl(r.club),
    }
  })
  // Furthest stage first, then longest-waiting — the clubs that most need a
  // nudge lead the list.
  clubs.sort((a, b) => {
    const sa = a.stage.recognised ? a.stage.stageNumber : -1
    const sb = b.stage.recognised ? b.stage.stageNumber : -1
    if (sa !== sb) return sb - sa
    return (b.daysInStage ?? -1) - (a.daysInStage ?? -1)
  })

  const groups = new Map<
    string,
    { stageNumber: number | null; stageLabel: string; count: number }
  >()
  for (const c of clubs) {
    const key = c.stage.recognised
      ? `${c.stage.stageNumber} ${c.stage.stageLabel}`
      : 'unrecognised'
    const g = groups.get(key) ?? {
      stageNumber: c.stage.recognised ? c.stage.stageNumber : null,
      stageLabel: c.stage.recognised
        ? c.stage.stageLabel
        : 'Stage not recognised',
      count: 0,
    }
    g.count += 1
    groups.set(key, g)
  }

  return {
    value: { kind: 'count', value: clubs.length },
    clubs,
    byStage: [...groups.values()],
  }
}

function buildChartered(
  districtId: string,
  records: readonly NewClubRecord[] | null,
  count: number | null,
  programYear: { startDate: string; endDate: string },
  asOfDate: string
): ClubGrowthFunnel['chartered'] {
  const until = asOfDate < programYear.endDate ? asOfDate : programYear.endDate
  const clubs: CharteredRow[] = (records ?? [])
    .map(r => ({ r, charterDate: usDateToIso(r.charterDate) }))
    .filter(
      (x): x is { r: NewClubRecord; charterDate: string } =>
        x.charterDate !== null &&
        x.charterDate >= programYear.startDate &&
        x.charterDate <= until
    )
    .map(({ r, charterDate }) => ({
      clubId: r.club,
      clubName: r.name,
      division: r.division,
      area: r.area,
      charterDate,
      href: clubHref(districtId, r.club),
    }))
    .sort((a, b) => b.charterDate.localeCompare(a.charterDate))

  // TI's dashboard count is the stage value. Without it, the new-club
  // report's rows stand in only when there are some: an empty report next to
  // an uncollected count is not evidence of zero charters.
  let value: StageValue
  if (count !== null) value = { kind: 'count', value: count }
  else if (clubs.length > 0) value = { kind: 'count', value: clubs.length }
  else value = { kind: 'unknown', reason: NOT_COLLECTED }

  return { value, clubs }
}

function buildCoached(
  districtId: string,
  records: readonly CoachRecord[]
): ClubGrowthFunnel['coached'] {
  const latest = (rows: readonly CoachRecord[]) => {
    const byClub = new Map<string, CoachedRow>()
    for (const r of rows) {
      const since = usDateToIso(r.beginDate)
      const prev = byClub.get(r.club)
      if (prev && (prev.since ?? '') >= (since ?? '')) continue
      byClub.set(r.club, {
        clubId: r.club,
        clubName: r.clubName,
        since,
        status: r.activeCoach ? 'active' : 'completed',
        href: clubHref(districtId, r.club),
      })
    }
    return [...byClub.values()].sort((a, b) =>
      (b.since ?? '').localeCompare(a.since ?? '')
    )
  }

  const active = latest(records.filter(r => r.activeCoach))
  const activeIds = new Set(active.map(c => c.clubId))
  const completed = latest(
    records.filter(r => !r.activeCoach && !activeIds.has(r.club))
  )
  return { value: { kind: 'count', value: active.length }, active, completed }
}

export function buildClubGrowthFunnel({
  districtId,
  reports,
  counts,
  programYear,
  asOfDate,
}: BuildClubGrowthFunnelInput): ClubGrowthFunnel {
  const sections = reports?.sections

  const prospective = sections?.prospectiveClubs
    ? buildProspective(sections.prospectiveClubs.records, asOfDate)
    : {
        value: { kind: 'unknown', reason: NO_REPORT } as StageValue,
        clubs: [],
        byStage: [],
      }

  const chartered = buildChartered(
    districtId,
    sections?.newClubs?.records ?? null,
    counts.chartered,
    programYear,
    asOfDate
  )

  const coached = sections?.coaches
    ? buildCoached(districtId, sections.coaches.records)
    : {
        value: { kind: 'unknown', reason: NO_REPORT } as StageValue,
        active: [],
        completed: [],
      }

  const suspended: StageValue =
    counts.suspended === null
      ? { kind: 'unknown', reason: NOT_COLLECTED }
      : { kind: 'count', value: counts.suspended }

  return { prospective, chartered, coached, suspended: { value: suspended } }
}
