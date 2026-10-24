/**
 * Find-A-Club continuity for the completeness gate (#2239 AC3).
 *
 * The same-date check (dateCompletenessGate.ts) asks whether staging has at
 * least what production has for a date. Once production is stripped it has
 * no memory: in #2237, 81 prod dates lost their FAC data and every later
 * rebuild of them passed, because staging matched the stripped prod copy.
 * And a daily's new date has no prod copy at all, so a FAC merge that lost a
 * district there passed too.
 *
 * For each touched date in the FAC era (FAC_ENRICHED_SINCE on, less the
 * known-unenriched dates) this adds two checks on a sample of the date's
 * district files:
 *
 *   1. Continuity, per district. The baseline is the BEST coverage over the
 *      date's own prod copy and the FAC_BASELINE_DATES nearest earlier prod
 *      dates (prod's `v1/dates.json`; prod is the gated record, and its
 *      index is promoted last, so it lists only pre-run dates). It holds when
 *      a district the baseline had merged (`data.prospectiveClubs`, the mark
 *      the merge always writes) is unmerged, or when its share of clubs with
 *      coordinates, an address or a meeting day/time/schedule drops by
 *      FAC_DROP_SHARE or more AND by FAC_MIN_CLUBS_LOST clubs or more.
 *      Losses in 1 or 2 districts WARN and the date promotes; 3 or more
 *      (FAC_HOLD_MIN_DISTRICTS) hold it ("warn on few, hold on many").
 *      Suspended clubs are left out of the shares: FAC hides them (#490).
 *   2. A floor, per date. Fewer than FAC_FLOOR_MIN_MERGED_SHARE of the
 *      sampled districts FAC-merged holds the date, whatever the baselines
 *      say. This is what an already-stripped baseline cannot satisfy: the
 *      floor compares the date with the FAC era, not with another copy.
 *
 * Thresholds, from the daily logs (`district NN: matched=M, snapshot-only=S`
 * of every daily 2026-09-02..10-12): all 94 districts merged on all 40
 * dailies; a district's matched share moved at most 1.4 points day to day
 * (mean 0.06) and 3.4 points over 40 days; the lowest share was 90.8 % and
 * the smallest district had 28 clubs. A real loss is total (#2237: 158/162
 * → 0/162). 10 points is about 3x the worst 40-day drift; the 3-club minimum
 * keeps a small district's 1–2 club changes from holding a date.
 *
 * New districts (no baseline file) and removed ones (no staging file) are
 * not losses; the floor still counts a new one. A program year's first date
 * compares with the prior year's last: FAC is a live directory, not
 * PY-bound, and coverage is a share of the clubs listed, so the rollover's
 * club changes carry over. 0-club files (#1671 gap junk) are skipped.
 *
 * Residual: a PARTIAL loss (some districts, or part of a district) on a run
 * of more than FAC_BASELINE_DATES consecutive dates that are already
 * equally damaged in prod passes. It can only arise from an override or
 * from before this check, since each such date would have held when it was
 * first written.
 */

import type { DateRegression } from './dateCompletenessGate.js'

/** The first daily with the FAC merge (#429); no date before it has FAC. */
export const FAC_ENRICHED_SINCE = '2026-05-15'

/**
 * FAC-era dates with no FAC data and no source to restore it from
 * (.routine-tmp/fac-stripped-audit-2026-10-22.md, #2239):
 *   - group A, enriched copy in prod only; Ron declined the recovery:
 *     05-30, 05-31, 06-06 .. 06-09;
 *   - group D, no enriched copy anywhere (all but 06-30 were first written
 *     by the 2026-09-13 backfill and never enriched): 06-30, 07-26 .. 07-30,
 *     08-11 .. 08-30 except 08-18 (no snapshot), 09-04 .. 09-11.
 * Adding a date here is a reviewed decision that it is unenriched for good.
 */
export const FAC_KNOWN_UNENRICHED_DATES: ReadonlySet<string> = new Set([
  ...['2026-05-30', '2026-05-31'],
  ...range('2026-06', 6, 9),
  '2026-06-30',
  ...range('2026-07', 26, 30),
  ...range('2026-08', 11, 30).filter(d => d !== '2026-08-18'),
  ...range('2026-09', 4, 11),
])

/** Earlier prod dates in the best-of baseline. */
export const FAC_BASELINE_DATES = 3
/** A coverage share drop this large (and FAC_MIN_CLUBS_LOST) holds. */
export const FAC_DROP_SHARE = 0.1
export const FAC_MIN_CLUBS_LOST = 3
/**
 * Warn on few, hold on many (Ron, 2026-10-24): districts with a per-district
 * FAC loss on one date below this count warn and the date promotes; this
 * many or more hold it. A single district's FAC fetch failing twice running
 * (the fallback reads one persisted date only) is the realistic narrow
 * loss, and a hold of a daily's new date freezes every later daily's
 * globals until an override, so one or two districts must not hold. A
 * broad loss is a pipeline fault: #2237 stripped every district at once,
 * and in 50 dailies (2026-09-02..10-23, ~4,700 district fetches) no
 * district ever lost its FAC, so 3 at once is not chance.
 */
export const FAC_HOLD_MIN_DISTRICTS = 3
/** Below this share of FAC-merged sampled districts, the date holds. */
export const FAC_FLOOR_MIN_MERGED_SHARE = 0.5

function range(month: string, from: number, to: number): string[] {
  return Array.from(
    { length: to - from + 1 },
    (_, i) => `${month}-${String(from + i).padStart(2, '0')}`
  )
}

/** What a district file holds of the FAC merge. */
export interface FacCoverage {
  /** `data.clubs` rows, less Suspended clubs (FAC hides them, #490). */
  clubs: number
  /** `data.prospectiveClubs` present: the merge ran on this file. */
  merged: boolean
  /** Rows with a numeric `coordinates.lat`/`lng` (a map point). */
  coordinates: number
  /** Rows with an `address` object. */
  address: number
  /** Rows with a `meetingDay`, `meetingTime` or `meetingSchedule`. */
  meeting: number
}

/** One baseline date's view of a district (null: no readable file). */
export interface FacBaseline {
  date: string
  coverage: FacCoverage | null
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const isFiniteNumber = (v: unknown): boolean =>
  typeof v === 'number' && Number.isFinite(v)

/**
 * TI hides a suspended club from Find-A-Club (#490), so it never has FAC
 * fields: counting it would make a suspension look like a FAC loss.
 */
function isSuspended(row: Record<string, unknown>): boolean {
  return (
    typeof row.clubStatus === 'string' &&
    row.clubStatus.trim().toLowerCase() === 'suspended'
  )
}

function hasPoint(row: Record<string, unknown>): boolean {
  const c = row.coordinates
  return isRecord(c) && isFiniteNumber(c.lat) && isFiniteNumber(c.lng)
}

function hasMeeting(row: Record<string, unknown>): boolean {
  return ['meetingDay', 'meetingTime', 'meetingSchedule'].some(
    k => row[k] !== undefined && row[k] !== null && row[k] !== ''
  )
}

/** FAC coverage of a `district_<id>.json`, null when it is not one. */
export function facCoverage(value: unknown): FacCoverage | null {
  if (!isRecord(value) || !isRecord(value.data)) return null
  const data = value.data
  if (!Array.isArray(data.clubs)) return null
  const rows = data.clubs.filter(isRecord).filter(r => !isSuspended(r))
  return {
    clubs: rows.length,
    merged: Array.isArray(data.prospectiveClubs),
    coordinates: rows.filter(hasPoint).length,
    address: rows.filter(r => isRecord(r.address)).length,
    meeting: rows.filter(hasMeeting).length,
  }
}

/** Whether a date is checked: in the FAC era and not known unenriched. */
export function facCheckApplies(date: string): boolean {
  return date >= FAC_ENRICHED_SINCE && !FAC_KNOWN_UNENRICHED_DATES.has(date)
}

/** The `count` nearest prod dates before `date` that are checked dates. */
export function facBaselineDates(
  prodDates: readonly string[],
  date: string,
  count: number = FAC_BASELINE_DATES
): string[] {
  return [...new Set(prodDates)]
    .filter(d => d < date && facCheckApplies(d))
    .sort()
    .reverse()
    .slice(0, count)
}

const FIELDS = ['coordinates', 'address', 'meeting'] as const

const pct = (n: number, of: number) =>
  `${Math.round((n / of) * 100)}% (${n}/${of})`

/** A date's FAC findings: `holds` hold it, `warnings` only alert. */
export interface FacFindings {
  holds: DateRegression[]
  warnings: DateRegression[]
}

/**
 * Every FAC loss on one date's sampled districts, against the baselines.
 * Per-district losses in fewer than FAC_HOLD_MIN_DISTRICTS districts are
 * warnings; that many, or the floor, hold the date with all of them.
 */
export function compareFacContinuity(
  date: string,
  staging: Readonly<Record<string, FacCoverage | null>>,
  baselines: Readonly<Record<string, readonly FacBaseline[]>>
): FacFindings {
  if (!facCheckApplies(date)) return { holds: [], warnings: [] }
  const dir = `snapshots/${date}/`
  const out: DateRegression[] = []
  const lostDistricts = new Set<string>()
  let floor: DateRegression | null = null
  const push = (path: string, reason: string) =>
    out.push({ date, path, reason: `${date}: ${reason}` })

  const ids = Object.keys(staging).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true })
  )
  let sampled = 0
  let merged = 0
  for (const id of ids) {
    const s = staging[id]
    if (!s || s.clubs === 0) continue
    sampled++
    if (s.merged) merged++
    const file = `${dir}district_${id}.json`
    const bases = (baselines[id] ?? []).filter(
      (b): b is { date: string; coverage: FacCoverage } =>
        b.coverage !== null && b.coverage.clubs > 0
    )

    const wasMerged = bases.find(b => b.coverage.merged)
    if (wasMerged && !s.merged) {
      lostDistricts.add(id)
      push(
        file,
        `Find-A-Club merge lost: no data.prospectiveClubs, which ${wasMerged.date} has (coordinates ${pct(wasMerged.coverage.coordinates, wasMerged.coverage.clubs)} there, ${pct(s.coordinates, s.clubs)} here)`
      )
      continue
    }
    for (const field of FIELDS) {
      let best: { date: string; coverage: FacCoverage } | undefined
      for (const b of bases) {
        const share = b.coverage[field] / b.coverage.clubs
        if (!best || share > best.coverage[field] / best.coverage.clubs) {
          best = b
        }
      }
      if (!best) continue
      const bestShare = best.coverage[field] / best.coverage.clubs
      const share = s[field] / s.clubs
      const lost = Math.round(bestShare * s.clubs) - s[field]
      if (bestShare - share >= FAC_DROP_SHARE && lost >= FAC_MIN_CLUBS_LOST) {
        lostDistricts.add(id)
        push(
          file,
          `Find-A-Club ${field} ${pct(best.coverage[field], best.coverage.clubs)} on ${best.date} → ${pct(s[field], s.clubs)}`
        )
      }
    }
  }

  if (sampled > 0 && merged / sampled < FAC_FLOOR_MIN_MERGED_SHARE) {
    floor = {
      date,
      path: dir,
      reason: `${date}: only ${merged} of ${sampled} sampled district(s) are Find-A-Club-merged (data.prospectiveClubs); every date from ${FAC_ENRICHED_SINCE} on is, unless it is a known-unenriched date (#2239)`,
    }
  }
  const broad = floor !== null || lostDistricts.size >= FAC_HOLD_MIN_DISTRICTS
  if (!broad) return { holds: [], warnings: out }
  return { holds: floor ? [...out, floor] : out, warnings: [] }
}
