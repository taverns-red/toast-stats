/**
 * TanStack column model for the club table (#835, epic #821 Sprint 1).
 *
 * This is the presentation / sort / sizing / pinning descriptor set that
 * replaces the hand-rolled `COLUMN_CONFIGS.map` header + hand-ordered `<td>`
 * body that ClubsTable used to carry inline. The **filter** subsystem keeps its
 * own metadata in `filters/types.ts` `COLUMN_CONFIGS` (consumed by the Filters
 * drawer, the URL codec, the active-filters bar) — see ADR-006: the column
 * model and the filter model are deliberately separate concerns.
 *
 * Sort fidelity to the pre-migration switch comparator (Lesson 117 — a
 * migration must not change output):
 *   • Each `accessorFn` returns the exact value the old switch compared on
 *     (lowercased strings; the precomputed `distinguishedOrder`; a status-rank
 *     map). `sortFn: 'basic'` (v9's `sortFn_basic`, `a === b ? 0 : a > b ? 1
 *     : -1`; `sortingFn` in v8) reproduces the old `<`/`>` comparison.
 *   • `sortUndefined: 'last'` reproduces "undefined sorts to the end regardless
 *     of direction" (TanStack applies it outside the desc negation).
 *   • The old "secondary sort by club name, always ascending" is reproduced by
 *     feeding ClubsTable's data to the table **pre-sorted by name asc**:
 *     TanStack's sort is stable, so equal-primary rows keep that name-asc order
 *     in both directions. (See `clubsColumns.test.tsx`.)
 */

import React from 'react'
import { Link } from 'react-router-dom'
import { clubsColumnHelper as colHelper } from './clubsTableFeatures'
import type { ClubsTableMeta } from './clubsTableFeatures'
import type { ClubHealthStatus } from '../hooks/useDistrictAnalytics'
import { isProvisionallyDistinguished } from '../utils/provisionalDistinguished'
import { coachFilterValue, coachSortRank } from '../utils/clubCoach'
import { ClubStatusCell } from './ClubStatusCell'
import { ClubTrendSparkline, formatSignedNet } from './ClubTrendSparkline'
import { HealthStatusCell } from './dataTable/cells/HealthStatusCell'
import { TierCell } from './dataTable/cells/TierCell'

// Health and Tier render through the shared dataTable cells (#2676): a shape
// marker plus text, and plain-text tier. No pills, fills or row tints.

const STATUS_RANK: Record<ClubHealthStatus, number> = {
  'intervention-required': 0,
  vulnerable: 1,
  thriving: 2,
}

/** Responsive priority per column (ADR-006 §3). `sticky` = the pinned key
 *  column (never hidden); `desktop` = revealed only ≥1280px (hidden at the
 *  768–1279 tablet tier); `core` = always shown when the table renders. */
export type ClubColumnPriority = 'sticky' | 'desktop' | 'core'

// `ClubsTableMeta` moved to ./clubsTableFeatures in the v9 migration (#1530):
// v9 types `table.options.meta` from the `tableMeta` slot on the feature set,
// so the interface has to live beside `tableFeatures(...)`. Re-exported here so
// importers of `./clubsColumns` are unaffected. This replaces the v8 global
// `declare module '@tanstack/react-table'` augmentation, which typed `meta` for
// EVERY table in the app rather than just this one.
export type { ClubsTableMeta }

const STICKY_FIELD = 'name'
const DESKTOP_ONLY_FIELDS: ReadonlySet<string> = new Set([
  'division',
  'area',
  'newMembers',
  'octoberRenewals',
  'aprilRenewals',
  'clubStatus',
  'coach',
  'yearsChartered',
])

export const clubColumnPriority = (id: string): ClubColumnPriority =>
  id === STICKY_FIELD
    ? 'sticky'
    : DESKTOP_ONLY_FIELDS.has(id)
      ? 'desktop'
      : 'core'

/** Responsive priority CSS class for a header/cell — matches the pre-migration
 *  `colPriorityClass` exactly so the existing CSS (sticky + @media hide) and
 *  the parity tests keep working unchanged. */
export const clubColumnPriorityClass = (id: string): string => {
  const p = clubColumnPriority(id)
  return p === 'sticky'
    ? 'clubs-table__sticky-col'
    : p === 'desktop'
      ? 'clubs-table__col--desktop'
      : ''
}

// Per-column `<td>` class WITHOUT the priority class (ClubsTable appends
// `clubColumnPriorityClass(id)`), reproducing the original cell classes exactly.
const TD_BASE_CLASS: Record<string, string> = {
  name: 'px-2 py-3 whitespace-nowrap',
  division: 'px-2 py-3 whitespace-nowrap text-sm clubs-cell-muted text-center',
  area: 'px-2 py-3 whitespace-nowrap text-sm clubs-cell-muted text-center',
  status: 'px-2 py-3 whitespace-nowrap text-center',
  membership:
    'px-2 py-3 whitespace-nowrap text-sm text-center clubs-members-cell',
  netChange: 'px-2 py-3 whitespace-nowrap text-sm',
  membersNeeded:
    'px-2 py-3 whitespace-nowrap text-sm tabular-nums text-center font-medium',
  newMembers: 'px-2 py-3 whitespace-nowrap text-sm tabular-nums text-center',
  octoberRenewals:
    'px-2 py-3 whitespace-nowrap text-sm tabular-nums text-center',
  aprilRenewals: 'px-2 py-3 whitespace-nowrap text-sm tabular-nums text-center',
  dcpGoals: 'px-2 py-3 whitespace-nowrap text-center',
  distinguished: 'px-2 py-3 whitespace-nowrap text-center',
  clubStatus: 'px-2 py-3 whitespace-nowrap text-sm text-center',
  coach: 'px-2 py-3 whitespace-nowrap text-sm text-center',
  yearsChartered:
    'px-2 py-3 whitespace-nowrap text-sm tabular-nums text-center',
  // Opt-in "Changes" group delta cells (#795). Same vertical rhythm as the
  // core numeric cells; ChangeIndicator owns the colour + sign + arrow.
  deltaMembership:
    'px-2 py-3 whitespace-nowrap text-sm tabular-nums text-center',
  deltaPayments: 'px-2 py-3 whitespace-nowrap text-sm tabular-nums text-center',
  deltaDcpGoals: 'px-2 py-3 whitespace-nowrap text-sm tabular-nums text-center',
  tierTransition: 'px-2 py-3 whitespace-nowrap text-sm text-center',
  distinguishedFlip: 'px-2 py-3 whitespace-nowrap text-sm text-center',
  // "vs last year" (#2432): then → now plus the signed change.
  sinceLastYear: 'px-2 py-3 whitespace-nowrap text-sm',
}

/** Exact `<td>` className for a column: base + responsive priority class. */
export const clubColumnTdClass = (id: string): string =>
  `${TD_BASE_CLASS[id] ?? 'px-2 py-3 whitespace-nowrap'} ${clubColumnPriorityClass(id)}`.trim()

/** A muted em-dash placeholder, shared by the optional numeric/text columns. */
const Dash: React.FC = () => <span className="clubs-cell-muted">—</span>

/** Optional integer cell: em-dash when undefined; muted when zero. Matches the
 *  New / Oct Renew / Apr Renew cells exactly. */
const OptionalCount: React.FC<{ value: number | undefined }> = ({ value }) =>
  value !== undefined ? (
    <span className={value === 0 ? 'clubs-cell-muted' : undefined}>
      {value}
    </span>
  ) : (
    <Dash />
  )

export const clubsColumns = colHelper.columns([
  colHelper.accessor(c => c.clubName.toLowerCase(), {
    id: 'name',
    header: 'Club',
    sortFn: 'basic',
    cell: info => {
      const club = info.row.original
      const meta = info.table.options.meta as ClubsTableMeta | undefined
      const to = meta?.clubLinkTo?.(club)
      // CC-7 (#872): a real <Link> on the club name restores middle-click /
      // ⌘-click / open-in-new-tab and announces the destination to AT. The row
      // itself is also clickable (mouse convenience), so stop the click from
      // bubbling — otherwise a name-click would navigate twice.
      return to ? (
        <Link
          to={to}
          state={meta?.clubLinkState}
          className="clubs-name-link font-medium text-sm"
          onClick={e => e.stopPropagation()}
        >
          {club.clubName}
        </Link>
      ) : (
        <div className="font-medium text-sm">{club.clubName}</div>
      )
    },
  }),
  colHelper.accessor(c => c.divisionName.toLowerCase(), {
    id: 'division',
    header: 'Div',
    sortFn: 'basic',
    cell: info => info.row.original.divisionName,
  }),
  colHelper.accessor(c => c.areaName.toLowerCase(), {
    id: 'area',
    header: 'Area',
    sortFn: 'basic',
    cell: info => info.row.original.areaName,
  }),
  colHelper.accessor(c => STATUS_RANK[c.currentStatus], {
    id: 'status',
    header: 'Health',
    sortFn: 'basic',
    cell: info => <HealthStatusCell status={info.row.original.currentStatus} />,
  }),
  colHelper.accessor(c => c.latestMembership, {
    id: 'membership',
    header: 'Members',
    sortFn: 'basic',
    cell: info => {
      const club = info.row.original
      return (
        <>
          <span className="tabular-nums">{club.latestMembership}</span>
          {club.membershipBase !== undefined && (
            <span className="clubs-cell-muted tabular-nums">
              {' / '}
              {club.membershipBase}
            </span>
          )}
        </>
      )
    },
  }),
  // Membership-trend sparkline (#1792). Sorts by the signed net change; clubs
  // with no recorded base have no delta and sort last in both directions.
  colHelper.accessor(c => c.netChange ?? undefined, {
    id: 'netChange',
    header: 'Trend',
    sortFn: 'basic',
    sortUndefined: 'last',
    cell: info => {
      const club = info.row.original
      return (
        <span className="clubs-trend-cell">
          <ClubTrendSparkline club={club} />
          {/* The sparkline's accessible name already carries the net. */}
          <span
            className="clubs-trend-cell__net tabular-nums"
            aria-hidden="true"
          >
            {club.netChange == null
              ? '\u2014'
              : formatSignedNet(club.netChange)}
          </span>
        </span>
      )
    },
  }),
  colHelper.accessor(c => c.membersNeeded, {
    id: 'membersNeeded',
    header: 'Needed',
    sortFn: 'basic',
    cell: info =>
      info.row.original.membersNeeded > 0 ? (
        <span className="text-tm-true-maroon">
          {info.row.original.membersNeeded}
        </span>
      ) : (
        <Dash />
      ),
  }),
  colHelper.accessor(c => c.newMembers, {
    id: 'newMembers',
    header: 'New',
    sortFn: 'basic',
    sortUndefined: 'last',
    cell: info => <OptionalCount value={info.row.original.newMembers} />,
  }),
  colHelper.accessor(c => c.octoberRenewals, {
    id: 'octoberRenewals',
    header: 'Oct Renew',
    sortFn: 'basic',
    sortUndefined: 'last',
    cell: info => <OptionalCount value={info.row.original.octoberRenewals} />,
  }),
  colHelper.accessor(c => c.aprilRenewals, {
    id: 'aprilRenewals',
    header: 'Apr Renew',
    sortFn: 'basic',
    sortUndefined: 'last',
    cell: info => <OptionalCount value={info.row.original.aprilRenewals} />,
  }),
  colHelper.accessor(c => c.latestDcpGoals, {
    id: 'dcpGoals',
    header: 'DCP',
    sortFn: 'basic',
    cell: info => {
      const goals = Math.max(0, Math.min(10, info.row.original.latestDcpGoals))
      const pct = (goals / 10) * 100
      return (
        <div className="clubs-dcp-cell">
          <span className="clubs-dcp-cell__val tabular-nums">{goals}/10</span>
          <div
            className="clubs-dcp-bar"
            role="progressbar"
            aria-valuenow={goals}
            aria-valuemin={0}
            aria-valuemax={10}
            aria-label="DCP goals achieved"
          >
            <div className="clubs-dcp-bar__fill" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )
    },
  }),
  colHelper.accessor(c => c.distinguishedOrder, {
    id: 'distinguished',
    header: 'Tier',
    sortFn: 'basic',
    cell: info => {
      const club = info.row.original
      return (
        <TierCell
          level={club.distinguishedLevel}
          provisional={isProvisionallyDistinguished(club)}
        />
      )
    },
  }),
  colHelper.accessor(c => c.clubStatus?.toLowerCase(), {
    id: 'clubStatus',
    header: 'Club Status',
    sortFn: 'basic',
    sortUndefined: 'last',
    cell: info => (
      <ClubStatusCell
        clubStatus={info.row.original.clubStatus}
        statusOverlay={info.row.original.statusOverlay}
      />
    ),
  }),
  // Coach (#1954): Active / Completed / — from the daily Coaches report.
  // Sorted active → completed → none via a rank; status only, no identity.
  colHelper.accessor(c => coachSortRank(c), {
    id: 'coach',
    header: 'Coach',
    sortFn: 'basic',
    cell: info => {
      const value = coachFilterValue(info.row.original)
      return value === 'None' ? <Dash /> : <span>{value}</span>
    },
  }),
  colHelper.accessor(c => c.yearsChartered ?? undefined, {
    id: 'yearsChartered',
    header: 'Years',
    sortFn: 'basic',
    sortUndefined: 'last',
    cell: info =>
      info.row.original.yearsChartered !== null ? (
        <span>{info.row.original.yearsChartered}</span>
      ) : (
        <Dash />
      ),
  }),
])
