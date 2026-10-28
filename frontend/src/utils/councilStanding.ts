/* District Council voting strength as of a council date (#2300).

   Who votes: each Member Club in good standing, 2 votes (DAB Art. IX(a),
   X(d)); quorum is one-third of those clubs (DAB Art. X(c)). Good standing is
   dues for the current dues period for 8+ members, 3 of them renewing
   (Policy 2.0 §4) — and TI already publishes its verdict as the dashboard's
   Club Status column. We read that (`clubStatus === 'Active'`) and never
   recompute it from counts: TI waives the renewal clause for a club in its
   first period, which a count-based rule would get wrong.

   Dues periods start Apr 1 and Oct 1, and every status resets at the
   boundary, so a snapshot from the previous period says nothing about the
   council date. `resolveCouncilSnapshot` refuses that case rather than
   showing a count that is 10–20 clubs off. Pure: no fetches, no clock. */

/** A gap between the TI data and the council date above this shows a note. */
export const COUNCIL_STALE_DAYS = 7

/** Votes per Member Club in good standing (DAB Art. IX(a), X(d)). */
export const VOTES_PER_CLUB = 2

export const COUNCIL_DISCLAIMER =
  "This list is derived from TI's public dashboard, not TI's official credentials list (District Central). Credentials Chairs should confirm it against the District Council report in District Central (District Leadership Handbook p.87). Dues paid after the TI data date, and new clubs TI has not yet posted, are not reflected."

export interface DuesPeriod {
  /** First day, ISO (YYYY-04-01 or YYYY-10-01). */
  start: string
  /** Last day, ISO (YYYY-09-30 or YYYY-03-31). */
  end: string
  /** e.g. "October 2026 dues period". */
  label: string
}

/** The dues period (Policy 2.0 §4: due Apr 1 and Oct 1) an ISO date is in. */
export function duesPeriodOf(iso: string): DuesPeriod {
  const year = Number(iso.slice(0, 4))
  const month = Number(iso.slice(5, 7))
  if (month >= 4 && month <= 9) {
    return {
      start: `${year}-04-01`,
      end: `${year}-09-30`,
      label: `April ${year} dues period`,
    }
  }
  const startYear = month >= 10 ? year : year - 1
  return {
    start: `${startYear}-10-01`,
    end: `${startYear + 1}-03-31`,
    label: `October ${startYear} dues period`,
  }
}

function daysBetween(fromIso: string, toIso: string): number {
  const ms =
    Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)
  return Math.round(ms / 86_400_000)
}

export type CouncilSnapshotResolution<T extends string> =
  | { status: 'none'; firstDate: T | undefined }
  | {
      /**
       * ok — same period, gap within the threshold.
       * stale — same period, gap above it.
       * future — council date after today, same period as the latest data.
       * period-mismatch — the data is from another dues period: show no count.
       */
      status: 'ok' | 'stale' | 'future' | 'period-mismatch'
      snapshotDate: T
      /** Days from the snapshot to the council date (0 = same day). */
      gapDays: number
      councilPeriod: DuesPeriod
      snapshotPeriod: DuesPeriod
    }

/**
 * Pick the latest snapshot on or before the council date and say whether it
 * can answer for that date. `today` is passed in (ISO) so this stays pure.
 */
export function resolveCouncilSnapshot<T extends string>(
  dates: readonly T[],
  councilDate: string,
  today: string,
  staleDays: number = COUNCIL_STALE_DAYS
): CouncilSnapshotResolution<T> {
  const sorted = [...dates].sort()
  let snapshotDate: T | undefined
  for (const d of sorted) {
    if (d <= councilDate) snapshotDate = d
    else break
  }
  if (snapshotDate === undefined) {
    return { status: 'none', firstDate: sorted[0] }
  }
  const councilPeriod = duesPeriodOf(councilDate)
  const snapshotPeriod = duesPeriodOf(snapshotDate)
  const gapDays = daysBetween(snapshotDate, councilDate)
  const status =
    councilPeriod.start !== snapshotPeriod.start
      ? 'period-mismatch'
      : councilDate > today
        ? 'future'
        : gapDays > staleDays
          ? 'stale'
          : 'ok'
  return { status, snapshotDate, gapDays, councilPeriod, snapshotPeriod }
}

/** One-third of the clubs in good standing, rounded up (DAB Art. X(c)). */
export function quorumOf(clubsInGoodStanding: number): number {
  return Math.ceil(clubsInGoodStanding / 3)
}

/** The snapshot club fields this needs (a subset of ClubStatisticsFile). */
export interface CouncilClub {
  clubId: string
  clubName: string
  divisionId: string
  divisionName: string
  areaId: string
  areaName: string
  clubStatus?: string
  isProspective?: boolean
  octoberRenewals: number
  aprilRenewals: number
}

export interface CouncilRow {
  clubId: string
  clubName: string
  divisionId: string
  divisionName: string
  areaId: string
  areaName: string
  /** TI's Club Status, verbatim ('' when the snapshot has none). */
  tiStatus: string
  inGoodStanding: boolean
  votes: number
  /** Neutral reason a club is not in good standing; '' when it is. */
  reason: string
}

export interface CouncilStanding {
  rows: CouncilRow[]
  good: CouncilRow[]
  notGood: CouncilRow[]
  goodCount: number
  clubVotes: number
  quorumClubs: number
}

function reasonFor(tiStatus: string): string {
  if (tiStatus === 'Low') return 'Fewer than 8 paid members this dues period'
  if (tiStatus === '') return 'No TI status in this snapshot'
  return `TI status: ${tiStatus}`
}

/** Clubs in good standing, their votes and the quorum, from TI's status. */
export function deriveCouncilStanding(
  clubs: readonly CouncilClub[]
): CouncilStanding {
  const rows: CouncilRow[] = clubs
    .filter(c => c.isProspective !== true)
    .map(c => {
      const tiStatus = c.clubStatus ?? ''
      const inGoodStanding = tiStatus === 'Active'
      return {
        clubId: c.clubId,
        clubName: c.clubName,
        divisionId: c.divisionId,
        divisionName: c.divisionName,
        areaId: c.areaId,
        areaName: c.areaName,
        tiStatus,
        inGoodStanding,
        votes: inGoodStanding ? VOTES_PER_CLUB : 0,
        reason: inGoodStanding ? '' : reasonFor(tiStatus),
      }
    })
  const good = rows.filter(r => r.inGoodStanding)
  const notGood = rows.filter(r => !r.inGoodStanding)
  return {
    rows,
    good,
    notGood,
    goodCount: good.length,
    clubVotes: good.length * VOTES_PER_CLUB,
    quorumClubs: quorumOf(good.length),
  }
}

export interface DivisionGroup {
  divisionId: string
  divisionName: string
  rows: CouncilRow[]
}

/** Group by division (how a credentials desk works), clubs by area, name. */
export function groupByDivision(rows: readonly CouncilRow[]): DivisionGroup[] {
  const byDivision = new Map<string, DivisionGroup>()
  for (const r of rows) {
    const g = byDivision.get(r.divisionId) ?? {
      divisionId: r.divisionId,
      divisionName: r.divisionName,
      rows: [],
    }
    g.rows.push(r)
    byDivision.set(r.divisionId, g)
  }
  const groups = [...byDivision.values()].sort((a, b) =>
    a.divisionId.localeCompare(b.divisionId)
  )
  for (const g of groups) {
    g.rows.sort(
      (a, b) =>
        a.areaId.localeCompare(b.areaId, undefined, { numeric: true }) ||
        a.clubName.localeCompare(b.clubName)
    )
  }
  return groups
}

/** The CSV export's rows: disclaimer first, then a header and one row each. */
export function councilStandingCsvRows(args: {
  districtId: string
  snapshotDate: string
  councilDate: string
  rows: readonly CouncilRow[]
}): (string | number)[][] {
  const { districtId, snapshotDate, councilDate, rows } = args
  return [
    [COUNCIL_DISCLAIMER],
    [],
    [
      'District',
      'TI data as of',
      'Council date',
      'Club number',
      'Club name',
      'Division',
      'Area',
      'TI status',
      'In good standing',
      'Votes',
      'Reason',
    ],
    ...groupByDivision(rows).flatMap(g =>
      g.rows.map(r => [
        districtId,
        snapshotDate,
        councilDate,
        r.clubId,
        r.clubName,
        r.divisionId,
        r.areaId,
        r.tiStatus,
        r.inGoodStanding ? 'Y' : 'N',
        r.votes,
        r.reason,
      ])
    ),
  ]
}
