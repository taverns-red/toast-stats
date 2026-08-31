// CI re-trigger touch (#1459)
/**
 * Pure snapshot-to-snapshot diff engine ("What Changed", epic #797 Sprint 1).
 *
 * `diffSnapshots(from, to)` takes two dated `DistrictStatisticsFile` snapshots
 * and returns a `SnapshotDiff`: aggregate KPI deltas, a three-way club
 * partition, and a categorized, narrative-ready event list. No I/O — reusable
 * by a future collector pre-compute step (Phase 4) without rewrite.
 *
 * Load-bearing data facts (verified against live staging CDN, 2026-05-27):
 *   - Distinguished counts/flips come from raw `clubPerformance`
 *     "Club Distinguished Status" (`'' | D | S | P | M`), NOT `totals.*` —
 *     those are unpopulated mid-year and would always read 0 (Lesson 115).
 *   - Roster appear/disappear is a visibility/status signal, classified by
 *     `clubStatus`, never an error (Lesson 118).
 *   - DCP signals use the raw `dcpGoals` count, never inferred Goals 1-N order.
 *   - A roster move across a district REALIGNMENT is not a club joining or
 *     leaving (#1443) — see `detectRosterDiscontinuity` below.
 *
 * @module diffSnapshots
 * @see docs/design/what-changed-feature.md §3-§4
 */

import type {
  DistrictStatisticsFile,
  ClubStatisticsFile,
  AggregateDelta,
  ClubDiff,
  ClubPresence,
  DiffEvent,
  RosterDiscontinuity,
  SnapshotDiff,
} from '@taverns-red/shared-contracts'
import {
  getProgramYearStartYear,
  programYearForDate,
} from './AnalyticsUtils.js'
import { normalizeClubId } from '@taverns-red/shared-contracts'

function aggregate(from: number, to: number): AggregateDelta {
  return { from, to, delta: to - from }
}

/** Calendar days between two YYYY-MM-DD dates (absolute, whole days). */
function dayCountBetween(fromDate: string, toDate: string): number {
  const a = Date.parse(`${fromDate}T00:00:00Z`)
  const b = Date.parse(`${toDate}T00:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.round(Math.abs(b - a) / 86_400_000)
}

/** Per-club distinguished status code keyed by clubId, from clubPerformance. */
function distinguishedByClub(
  snapshot: DistrictStatisticsFile
): Map<string, string> {
  const map = new Map<string, string>()
  for (const row of snapshot.clubPerformance) {
    // Keyed canonically (#1440) so it joins the club maps below, whichever
    // padding the export used.
    const clubId = normalizeClubId(row['Club Number'])
    if (!clubId) continue
    const raw = row['Club Distinguished Status']
    map.set(clubId, raw == null ? '' : String(raw))
  }
  return map
}

/* ── Per-club payment-type attribution (#1459) ─────────────────────────────
 *
 * A club's payments total moves for five distinct reasons, and a district
 * leader campaigns on each differently: an October renewal is a retention win,
 * a new member is growth, a charter payment is a brand-new club. The engine
 * already diffed the total and threw the composition away.
 *
 * Sources (live-verified against the 2026-08-30 D61 snapshot, 2026-08-31):
 *   - October/April renewals and new members are TYPED, required fields on
 *     `clubs[]` — present in every snapshot.
 *   - Late renewals and charter payments exist ONLY in the raw
 *     `districtPerformance` rows (columns `Late Ren.` / `Total Chart`, keyed by
 *     the padded `Club` column). They are untyped, so they are also OPTIONAL:
 *     a snapshot without those rows leaves them `undefined` and their share
 *     surfaces as the `N other` residual. Never default them to 0 — a faked
 *     zero would silently report "no late renewals" where the truth is
 *     "we cannot see late renewals", the Lesson-115 failure mode.
 */

/** One club's payments split by type. `late`/`charter` absent = unavailable. */
interface PaymentTypes {
  oct: number
  apr: number
  new: number
  late?: number
  charter?: number
}

/**
 * A raw CSV cell as a payment count, or undefined when it is absent or
 * unreadable. A payment count is a NON-NEGATIVE INTEGER: a negative or
 * fractional cell is corrupt, not a small number, and reading it as one would
 * feed a fabricated delta straight into the label.
 */
function rawCount(value: unknown): number | undefined {
  if (value === null || value === undefined || typeof value === 'boolean') {
    return undefined
  }
  const text = String(value).trim().replace(/,/g, '')
  if (text === '') return undefined
  const n = Number(text)
  return Number.isInteger(n) && n >= 0 ? n : undefined
}

/** Payment-type counts keyed canonically by clubId (#1440), like distinguishedByClub. */
function paymentTypesByClub(
  snapshot: DistrictStatisticsFile
): Map<string, PaymentTypes> {
  const map = new Map<string, PaymentTypes>()
  for (const club of snapshot.clubs) {
    const key = normalizeClubId(club.clubId)
    if (!key) continue
    map.set(key, {
      oct: club.octoberRenewals,
      apr: club.aprilRenewals,
      new: club.newMembers,
    })
  }
  for (const row of snapshot.districtPerformance) {
    const key = normalizeClubId(row['Club'])
    const entry = key ? map.get(key) : undefined
    if (!entry) continue
    // FIRST row wins: two raw rows can normalize onto one club (padded and
    // bare `Club` values in the same export). Overwriting would make the value
    // depend on row order, silently.
    const late = rawCount(row['Late Ren.'])
    const charter = rawCount(row['Total Chart'])
    if (late !== undefined && entry.late === undefined) entry.late = late
    if (charter !== undefined && entry.charter === undefined) {
      entry.charter = charter
    }
  }
  return map
}

/** Display nouns per payment type, singular/plural. */
const PAYMENT_TYPE_NOUNS: {
  key: keyof PaymentTypes
  one: string
  many: string
}[] = [
  { key: 'oct', one: 'October renewal', many: 'October renewals' },
  { key: 'apr', one: 'April renewal', many: 'April renewals' },
  { key: 'new', one: 'new member', many: 'new members' },
  { key: 'late', one: 'late renewal', many: 'late renewals' },
  { key: 'charter', one: 'charter payment', many: 'charter payments' },
]

/**
 * "Club X recorded 4 new payments (2 October renewals, 1 new member, 1 other)".
 *
 * Only types whose delta is POSITIVE are named, and the unexplained remainder
 * is reported as `N other`, so the parts always sum to EXACTLY the total. When
 * the named types already overshoot the total the breakdown is dropped
 * entirely — see the clamp below. A DECREASE gets no
 * breakdown at all: a payments total only falls through a TI-side correction,
 * and attributing that by type would narrate a story the numbers do not
 * support.
 */
function paymentsLabel(
  name: string,
  delta: number,
  from: PaymentTypes | undefined,
  to: PaymentTypes | undefined
): string {
  const n = Math.abs(delta)
  const noun = n === 1 ? 'payment' : 'payments'
  if (delta < 0) return `${name} recorded ${n} fewer ${noun}`

  // Only types that GREW are named — a type that shrank inside a growing total
  // is a correction, not a story. `claimed` therefore sums the POSITIVE deltas
  // only: it must equal what the parenthetical actually says, or the residual
  // computed from it would not close the gap it claims to close.
  const parts: string[] = []
  let claimed = 0
  if (from && to) {
    for (const { key, one, many } of PAYMENT_TYPE_NOUNS) {
      const a = from[key]
      const b = to[key]
      // Unavailable on EITHER side is unavailable for the delta.
      if (a === undefined || b === undefined) continue
      const d = b - a
      if (d > 0) {
        claimed += d
        parts.push(`${d} ${d === 1 ? one : many}`)
      }
    }
  }

  // The per-type counts and the total come from different columns and can
  // disagree — most reachably when a type's source column is absent on one
  // side and DataTransformer's fallback reports 0 (a 0→45 October jump against
  // a +3 total). When the named parts overshoot the total, the breakdown is
  // not a decomposition of it; print the total alone rather than a
  // parenthetical the headline contradicts.
  if (claimed > delta) return `${name} recorded ${n} new ${noun}`

  const residual = delta - claimed
  if (residual > 0) parts.push(`${residual} other`)

  const breakdown = parts.length > 0 ? ` (${parts.join(', ')})` : ''
  return `${name} recorded ${n} new ${noun}${breakdown}`
}

const TIER_NAMES: Record<string, string> = {
  D: 'Distinguished',
  S: 'Select Distinguished',
  P: "President's Distinguished",
  M: 'Smedley Distinguished',
}

function tierName(code: string): string {
  return TIER_NAMES[code] ?? 'Distinguished'
}

function membershipLabel(name: string, delta: number): string {
  const n = Math.abs(delta)
  const noun = n === 1 ? 'member' : 'members'
  return delta > 0 ? `${name} gained ${n} ${noun}` : `${name} lost ${n} ${noun}`
}

function dcpLabel(name: string, delta: number): string {
  const n = Math.abs(delta)
  const noun = n === 1 ? 'goal' : 'goals'
  return delta > 0
    ? `${name} met ${n} more DCP ${noun}`
    : `${name} dropped ${n} DCP ${noun}`
}

function distinguishedLabel(name: string, from: string, to: string): string {
  if (!from && to) return `${name} became ${tierName(to)}`
  if (from && !to) return `${name} lost Distinguished status`
  return `${name} moved to ${tierName(to)}`
}

function presence(club: ClubStatisticsFile, transferred = false): ClubPresence {
  const base: ClubPresence = {
    clubId: club.clubId,
    clubName: club.clubName,
    divisionId: club.divisionId,
    areaId: club.areaId,
    clubStatus: club.clubStatus ?? club.status,
  }
  // Only ever ADD the flag — an ordinary presence entry keeps its exact
  // previous shape (pinned by the within-year regression test).
  return transferred ? { ...base, transferred: true } : base
}

function rosterLabel(verb: string, club: ClubStatisticsFile): string {
  const status = club.clubStatus ?? club.status
  return `${club.clubName} (${status}) ${verb} the roster`
}

/* ── District-composition discontinuity (#1443) ────────────────────────────
 *
 * Toastmasters realigns district boundaries at a program-year boundary: the
 * 2026-07-01 reformation merged and split districts and moved clubs between
 * them. For a district that survived, the default "previous recorded date →
 * latest" pair straddles that boundary, so every transferred club used to
 * render as "X (Active) joined the roster" / "left the roster" — dozens of
 * them. Those clubs did not join or leave; the district moved under them.
 *
 * Detection is deliberately conservative — a false positive mislabels honest
 * club behaviour as a map change, while a false negative merely leaves today's
 * behaviour in place. All three conditions must hold:
 *
 *   1. the two dates fall in DIFFERENT program years (realignments take effect
 *      July 1 — a within-year pair can never be one, however large its churn),
 *   2. the pair is TIGHT around that boundary (a year-wide range accumulates
 *      ordinary charters and closures that are not a realignment),
 *   3. the roster exchange is REFORMATION-SIZED, both absolutely and relative
 *      to the district — the July renewal deadline drops a handful of clubs
 *      off every roster and that must not read as a boundary change.
 */

/** Minimum clubs present in only one snapshot before the case is considered. */
const DISCONTINUITY_MIN_MOVED_CLUBS = 8
/** …and as a share of the smaller roster (a small district moves fewer). */
const DISCONTINUITY_MIN_MOVED_RATIO = 0.2
/** Widest pair still read as "around" the boundary (May → August). */
const DISCONTINUITY_MAX_WINDOW_DAYS = 120

/** The inputs the predicate needs — dates and roster cardinalities only. */
interface DiscontinuityInput {
  fromDate: string
  toDate: string
  fromClubCount: number
  toClubCount: number
  movedInCount: number
  movedOutCount: number
}

/**
 * SEAM (#1442) — the single predicate deciding "these two dates straddle a
 * district-composition discontinuity". #1442 owns the shared discontinuity
 * helper for the YoY sites; when it lands, this body becomes a call into it
 * (or this function becomes an import alias) and nothing else in this file
 * changes. Keep the decision here, and only here.
 */
function detectRosterDiscontinuity(
  input: DiscontinuityInput
): RosterDiscontinuity | undefined {
  const {
    fromDate,
    toDate,
    fromClubCount,
    toClubCount,
    movedInCount,
    movedOutCount,
  } = input

  const fromPyStart = getProgramYearStartYear(fromDate)
  const toPyStart = getProgramYearStartYear(toDate)
  if (fromPyStart === toPyStart) return undefined
  if (dayCountBetween(fromDate, toDate) > DISCONTINUITY_MAX_WINDOW_DAYS) {
    return undefined
  }

  const moved = movedInCount + movedOutCount
  if (moved < DISCONTINUITY_MIN_MOVED_CLUBS) return undefined
  const baseline = Math.max(1, Math.min(fromClubCount, toClubCount))
  if (moved / baseline < DISCONTINUITY_MIN_MOVED_RATIO) return undefined

  return {
    kind: 'program-year-boundary',
    fromProgramYear: programYearForDate(fromDate),
    toProgramYear: programYearForDate(toDate),
    clubsMovedIn: movedInCount,
    clubsMovedOut: movedOutCount,
  }
}

/**
 * A club that appears in `to` having chartered on or after the `from` date is
 * a GENUINE new charter, not a boundary transfer — keep it in the roster
 * group so a real new club is not buried among thirty transfers.
 *
 * `charterDate` is an optional enrichment field (Find-a-Club), so this can
 * only ever promote a club out of the transfer group, never demote one into
 * it: an unparseable or missing date leaves the transfer classification.
 */
function isNewCharter(club: ClubStatisticsFile, fromDate: string): boolean {
  if (!club.charterDate) return false
  const chartered = Date.parse(club.charterDate)
  if (Number.isNaN(chartered)) return false
  return chartered >= Date.parse(`${fromDate}T00:00:00Z`)
}

/**
 * A club that disappears while suspended or ineligible left by CLOSURE, not
 * by transfer — Toastmasters suspends a club before it goes away, and a
 * realignment moves clubs in good standing. Keeps genuine closures visible.
 */
function isClosure(club: ClubStatisticsFile): boolean {
  const status = (club.clubStatus ?? club.status ?? '').toLowerCase()
  return status === 'suspended' || status === 'ineligible'
}

function transferLabel(
  direction: 'in' | 'out',
  club: ClubStatisticsFile,
  realignmentYear: number
): string {
  const status = club.clubStatus ?? club.status
  const where =
    direction === 'in' ? 'moved into the district' : 'moved to another district'
  return `${club.clubName} (${status}) ${where} in the ${realignmentYear} district realignment`
}

export function diffSnapshots(
  from: DistrictStatisticsFile,
  to: DistrictStatisticsFile
): SnapshotDiff {
  const fromDist = distinguishedByClub(from)
  const toDist = distinguishedByClub(to)
  const fromPayTypes = paymentTypesByClub(from)
  const toPayTypes = paymentTypesByClub(to)

  // Keyed on the CANONICAL club id (#1440). Keying on the raw id meant two
  // dates written from differently-padded TI exports diffed as every club
  // removed and re-added — a district-wide roster replacement that never
  // happened. The events below still carry each club's own stored id.
  const fromClubs = new Map(from.clubs.map(c => [normalizeClubId(c.clubId), c]))
  const toClubs = new Map(to.clubs.map(c => [normalizeClubId(c.clubId), c]))

  const distinguishedCount = (m: Map<string, string>): number =>
    [...m.values()].filter(s => s !== '').length

  const bothPresent: ClubDiff[] = []
  const onlyInFrom: ClubPresence[] = []
  const onlyInTo: ClubPresence[] = []
  const events: DiffEvent[] = []

  // Roster-move classification (#1443). Resolved BEFORE the main loop from the
  // two club-id sets alone, so the loop below keeps its exact previous shape
  // and event insertion order (the sort's final tie-break is insertion order).
  // A club leaving/arriving is a boundary transfer unless it is a genuine
  // closure/charter; with no discontinuity every move stays a roster event.
  //
  // Membership tests go through the CANONICAL key (#1440) because that is what
  // fromClubs/toClubs are keyed on — testing with the club's own stored id
  // would miss whenever the two dates were written from differently-padded TI
  // exports, which is the exact defect #1440 exists to remove. The SET itself
  // holds stored ids, because the loops below match against a club's own id.
  const movedOutClubs = [...fromClubs.values()].filter(
    c => !toClubs.has(normalizeClubId(c.clubId)) && !isClosure(c)
  )
  const movedInClubs = [...toClubs.values()].filter(
    c =>
      !fromClubs.has(normalizeClubId(c.clubId)) &&
      !isNewCharter(c, from.snapshotDate)
  )
  const rosterDiscontinuity = detectRosterDiscontinuity({
    fromDate: from.snapshotDate,
    toDate: to.snapshotDate,
    fromClubCount: fromClubs.size,
    toClubCount: toClubs.size,
    movedInCount: movedInClubs.length,
    movedOutCount: movedOutClubs.length,
  })
  const transferredIds = new Set(
    rosterDiscontinuity
      ? [...movedOutClubs, ...movedInClubs].map(c => c.clubId)
      : []
  )
  const realignmentYear = rosterDiscontinuity
    ? getProgramYearStartYear(to.snapshotDate)
    : 0

  for (const [key, fromClub] of fromClubs) {
    const toClub = toClubs.get(key)
    // Identity for the OUTPUT stays the club's own stored id; `key` is the
    // canonical join key only (#1440).
    const clubId = fromClub.clubId
    if (!toClub) {
      const transferred = transferredIds.has(clubId)
      onlyInFrom.push(presence(fromClub, transferred))
      events.push({
        category: transferred ? 'club-transferred-out' : 'club-removed',
        clubId,
        clubName: fromClub.clubName,
        label: transferred
          ? transferLabel('out', fromClub, realignmentYear)
          : rosterLabel('left', fromClub),
        magnitude: -1,
      })
      continue
    }

    const distFrom = fromDist.get(key) ?? ''
    const distTo = toDist.get(key) ?? ''
    const membership = aggregate(
      fromClub.membershipCount,
      toClub.membershipCount
    )
    const payments = aggregate(fromClub.paymentsCount, toClub.paymentsCount)
    const dcpGoals = aggregate(fromClub.dcpGoals, toClub.dcpGoals)

    bothPresent.push({
      clubId,
      clubName: toClub.clubName,
      divisionId: toClub.divisionId,
      areaId: toClub.areaId,
      membership,
      payments,
      dcpGoals,
      distinguishedFrom: distFrom,
      distinguishedTo: distTo,
      distinguishedChanged: distFrom !== distTo,
    })

    if (membership.delta !== 0) {
      events.push({
        category: 'membership',
        clubId,
        clubName: toClub.clubName,
        label: membershipLabel(toClub.clubName, membership.delta),
        magnitude: membership.delta,
      })
    }
    if (payments.delta !== 0) {
      events.push({
        category: 'payments',
        clubId,
        clubName: toClub.clubName,
        label: paymentsLabel(
          toClub.clubName,
          payments.delta,
          fromPayTypes.get(key),
          toPayTypes.get(key)
        ),
        magnitude: payments.delta,
      })
    }
    if (dcpGoals.delta !== 0) {
      events.push({
        category: 'dcp-goals',
        clubId,
        clubName: toClub.clubName,
        label: dcpLabel(toClub.clubName, dcpGoals.delta),
        magnitude: dcpGoals.delta,
      })
    }
    if (distFrom !== distTo) {
      const gained = !distFrom && distTo
      const lost = distFrom && !distTo
      events.push({
        category: 'distinguished',
        clubId,
        clubName: toClub.clubName,
        label: distinguishedLabel(toClub.clubName, distFrom, distTo),
        magnitude: gained ? 1 : lost ? -1 : 0,
      })
    }
  }

  for (const [key, toClub] of toClubs) {
    if (fromClubs.has(key)) continue
    const clubId = toClub.clubId
    const transferred = transferredIds.has(clubId)
    onlyInTo.push(presence(toClub, transferred))
    events.push({
      category: transferred ? 'club-transferred-in' : 'club-added',
      clubId,
      clubName: toClub.clubName,
      label: transferred
        ? transferLabel('in', toClub, realignmentYear)
        : rosterLabel('joined', toClub),
      magnitude: 1,
    })
  }

  // Biggest absolute change first; stable tie-break by name then clubId.
  events.sort((a, b) => {
    const byMag = Math.abs(b.magnitude) - Math.abs(a.magnitude)
    if (byMag !== 0) return byMag
    const byName = a.clubName.localeCompare(b.clubName)
    return byName !== 0 ? byName : a.clubId.localeCompare(b.clubId)
  })

  return {
    districtId: to.districtId,
    from: { date: from.snapshotDate },
    to: { date: to.snapshotDate },
    dayCount: dayCountBetween(from.snapshotDate, to.snapshotDate),
    totals: {
      membership: aggregate(
        from.totals.totalMembership,
        to.totals.totalMembership
      ),
      payments: aggregate(from.totals.totalPayments, to.totals.totalPayments),
      clubCount: aggregate(from.totals.totalClubs, to.totals.totalClubs),
      distinguished: aggregate(
        distinguishedCount(fromDist),
        distinguishedCount(toDist)
      ),
    },
    clubs: { bothPresent, onlyInFrom, onlyInTo },
    events,
    // Omitted entirely for an ordinary diff — never `undefined`-valued, so the
    // serialized shape of a normal diff is byte-identical to before (#1443).
    ...(rosterDiscontinuity ? { rosterDiscontinuity } : {}),
  }
}
