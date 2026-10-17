import type {
  RegionRollupFigures,
  RegionRollups,
} from '@taverns-red/shared-contracts'

/* regionRollupView (#1815) — the view model of the region and world rollup
   pages, built from one `region-rollups.json` (#1799). Pure: program year
   and snapshot date come from the page's controls (R3), never from the
   response.

   Absent is not zero: a null figure (its source column was not collected,
   or one of the block's districts lacked it) stays `count: null` and the
   page says "Not available". */

export interface RollupRow {
  key: string
  label: string
  /** Clubs in this bucket; null = not available (or not yet due). */
  count: number | null
  /** count ÷ the block's clubs (0–1); null when either is unknown. */
  share: number | null
  /** Why `count` is null ("Not available", "Not yet due (…)"); else null. */
  note: string | null
}

export type RollupSectionId =
  'health' | 'status' | 'distinguished' | 'compliance'

export interface RollupSection {
  id: RollupSectionId
  title: string
  /** One sentence on what the counts mean. */
  about: string
  rows: RollupRow[]
}

export interface RollupContext {
  /** "YYYY-YYYY", from the page's program-year control (R3). */
  programYear: string
  /** "YYYY-MM-DD", the page's pinned snapshot date (R3). */
  snapshotDate: string
}

export const NOT_AVAILABLE = 'Not available'

function row(
  key: string,
  label: string,
  count: number | null,
  clubs: number,
  note: string | null = null
): RollupRow {
  const resolvedNote = note ?? (count === null ? NOT_AVAILABLE : null)
  return {
    key,
    label,
    count,
    share: count === null || clubs <= 0 ? null : count / clubs,
    note: resolvedNote,
  }
}

export interface RollupKpis {
  clubs: number
  membership: number
  payments: number
  /** Clubs at any Distinguished level (the tiers are disjoint). */
  distinguished: number
}

export function rollupKpis(fig: RegionRollupFigures): RollupKpis {
  return {
    clubs: fig.clubs,
    membership: fig.membership,
    payments: fig.payments,
    distinguished: fig.clubs - fig.distinguished.notDistinguished,
  }
}

export function rollupSections(
  fig: RegionRollupFigures,
  ctx: RollupContext
): RollupSection[] {
  const n = fig.clubs
  const startYear = Number.parseInt(ctx.programYear.slice(0, 4), 10)
  // Same rule as the club Compliance panel (#1790): before the April period
  // opens (1 January of the PY's second year) April dues are not yet due.
  const aprilNotDue =
    Number.isFinite(startYear) && ctx.snapshotDate < `${startYear + 1}-01-01`

  const status: RollupRow[] = [
    row('active', 'Active', fig.clubStatus.active, n),
    row('low', 'Low', fig.clubStatus.low, n),
    row('ineligible', 'Ineligible', fig.clubStatus.ineligible, n),
    row('suspended', 'Suspended', fig.clubStatus.suspended, n),
  ]
  if (fig.clubStatus.other > 0) {
    status.push(row('other', 'Other', fig.clubStatus.other, n))
  }

  return [
    {
      id: 'health',
      title: 'Club health',
      about:
        'Each club classified by the shared club-health rule at this snapshot.',
      rows: [
        row('thriving', 'Thriving', fig.health.thriving, n),
        row('vulnerable', 'Vulnerable', fig.health.vulnerable, n),
        row(
          'interventionRequired',
          'Intervention required',
          fig.health.interventionRequired,
          n
        ),
      ],
    },
    {
      id: 'status',
      title: 'Club status',
      about: "Toastmasters International's club status column.",
      rows: status,
    },
    {
      id: 'distinguished',
      title: 'Distinguished clubs',
      about: 'Each club counted once, at the highest level it meets.',
      rows: [
        row('smedley', 'Smedley', fig.distinguished.smedley, n),
        row('president', "President's", fig.distinguished.president, n),
        row('select', 'Select', fig.distinguished.select, n),
        row(
          'distinguished',
          'Distinguished',
          fig.distinguished.distinguished,
          n
        ),
        row(
          'notDistinguished',
          'Not yet distinguished',
          fig.distinguished.notDistinguished,
          n
        ),
      ],
    },
    {
      id: 'compliance',
      title: 'Compliance',
      about: 'Clubs meeting each requirement on time.',
      rows: [
        row(
          'cspSubmitted',
          'Club Success Plan',
          fig.compliance.cspSubmitted,
          n
        ),
        row(
          'octoberDuesOnTime',
          'October renewals',
          fig.compliance.octoberDuesOnTime,
          n
        ),
        aprilNotDue
          ? row(
              'aprilDuesOnTime',
              'April renewals',
              null,
              n,
              `Not yet due (April ${startYear + 1})`
            )
          : row(
              'aprilDuesOnTime',
              'April renewals',
              fig.compliance.aprilDuesOnTime,
              n
            ),
        row(
          'officerListOnTime',
          'Officer list',
          fig.compliance.officerListOnTime,
          n
        ),
      ],
    },
  ]
}

/** One row of a breakdown table: a child block, linking down a level. */
export interface RollupChild {
  id: string
  label: string
  to: string
  figures: RegionRollupFigures
}

const byNumericId = (a: string, b: string): number =>
  Number(a) - Number(b) || a.localeCompare(b)

/** The region's districts, each linking to its district page. */
export function regionBreakdown(
  rollups: RegionRollups,
  regionId: string
): RollupChild[] {
  const region = rollups.regions?.[regionId]
  if (!region) return []
  return [...region.districtIds].sort(byNumericId).flatMap(id => {
    const figures = rollups.districts[id]
    return figures
      ? [{ id, label: `District ${id}`, to: `/district/${id}`, figures }]
      : []
  })
}

/** The world's regions, each linking to its region rollup page. */
export function worldBreakdown(rollups: RegionRollups): RollupChild[] {
  if (!rollups.regions) return []
  return Object.keys(rollups.regions)
    .sort(byNumericId)
    .map(id => ({
      id,
      label: `Region ${id}`,
      to: `/region/${id}/health`,
      figures: rollups.regions![id]!,
    }))
}

export interface AttentionRow {
  id: string
  label: string
  to: string
  count: number
  share: number
}

/** The children with the highest share of clubs needing intervention. */
export function needsAttention(
  children: readonly RollupChild[],
  limit = 3
): AttentionRow[] {
  return children
    .filter(c => c.figures.clubs > 0)
    .map(c => ({
      id: c.id,
      label: c.label,
      to: c.to,
      count: c.figures.health.interventionRequired,
      share: c.figures.health.interventionRequired / c.figures.clubs,
    }))
    .sort((a, b) => b.share - a.share || byNumericId(a.id, b.id))
    .slice(0, limit)
}

/** "42%" for a 0–1 share; "—" when unknown. */
export function formatShare(share: number | null): string {
  return share === null ? '—' : `${Math.round(share * 100)}%`
}
