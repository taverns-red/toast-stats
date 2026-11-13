/**
 * ClubHistoryTable (#1229, epic #1228) — one row per program year for a single
 * club's multi-year story (DCP, Distinguished tier, membership, renewals,
 * status).
 *
 * Comparison-across-rows table: its value is reading years against each other
 * ("declining / recovering / stable"), so per Lesson 105 it stays a TABLE
 * rather than card-collapse. From 768 up it is the shared DataTable (#2733,
 * #2676 M6): sort only, a caption, the program year as the row header (pinned
 * while metrics scroll sideways), and a keyboard-operable scroll region only
 * when the columns cannot fit.
 *
 * The phone chips' tier colours and dark mode are owned by `club-history.css`
 * themed variables (R10 — CSS-level overrides), NOT Tailwind
 * prefers-color-scheme variants (which misfire under this app's manual
 * `[data-theme='dark']` toggle — Lesson 107). The desktop table shows the tier
 * as plain text.
 */

import React, { useMemo, useState } from 'react'
import {
  columnSizingFeature,
  columnVisibilityFeature,
  createColumnHelper,
  rowSortingFeature,
  tableFeatures,
  useTable,
} from '@tanstack/react-table'
import { Link } from 'react-router-dom'
import type { ClubHistoryRow, ClubTierCode } from '../utils/clubHistory'
import { EM_DASH } from '../utils/clubHistory'
import { DataTable } from './dataTable/DataTable'
import type { SortDirection } from '../hooks/useUrlSort'
import {
  PriorityColumnsTable,
  type PriorityMetric,
} from './PriorityColumnsTable'
import { lifecycleDistrictLabel } from '../utils/clubLifecycle'

type SortField = 'year' | 'dcpGoals' | 'tier' | 'membershipNet' | 'status'

/** Sort rank for the distinguished tier (none < D < S < P < Smedley). */
const TIER_RANK: Record<ClubTierCode, number> = { D: 1, S: 2, P: 3, M: 4 }
function tierRank(code: ClubTierCode | null): number {
  return code ? TIER_RANK[code] : 0
}

/** Modifier class for the tier badge; null renders an em-dash, no badge. */
const TIER_MODIFIER: Record<ClubTierCode, string> = {
  D: 'club-history-tier--distinguished',
  S: 'club-history-tier--select',
  P: 'club-history-tier--presidents',
  M: 'club-history-tier--smedley',
}

function num(value: number | null): string {
  return value == null ? EM_DASH : String(value)
}

function signedNet(value: number | null): string {
  if (value == null) return EM_DASH
  return value > 0 ? `+${value}` : String(value)
}

/* Phone tier chip (#1834): a phone metric column holds ~80px of content, so
   "President's Distinguished" can never fit (it clipped as "President's
   Disting…" — Lesson 134). The chip shows a short label; the full name is
   the tooltip and the screen-reader text. */
const TIER_SHORT: Record<ClubTierCode, string> = {
  D: 'Dist.',
  S: 'Select',
  P: 'Pres.',
  M: 'Smedley',
}

const PHONE_METRICS: PriorityMetric<ClubHistoryRow, SortField>[] = [
  {
    id: 'dcpGoals',
    label: 'DCP',
    title: 'DCP goals met, of 10',
    sortField: 'dcpGoals',
    render: r => (r.dcpGoals == null ? EM_DASH : `${r.dcpGoals} / 10`),
  },
  {
    id: 'tier',
    label: 'Tier',
    title: 'Distinguished tier',
    sortField: 'tier',
    render: r =>
      r.tierCode ? (
        <span
          className={`priority-columns__tier ${TIER_MODIFIER[r.tierCode]}`}
          title={r.tierLabel}
        >
          <span aria-hidden="true">{TIER_SHORT[r.tierCode]}</span>
          <span className="sr-only">{r.tierLabel}</span>
        </span>
      ) : (
        <span className="club-history-muted">{EM_DASH}</span>
      ),
  },
  {
    id: 'membership',
    label: 'Members',
    title: 'Membership, base → end of year, with net change',
    sortField: 'membershipNet',
    render: r =>
      r.membershipBase == null && r.membershipEnd == null ? (
        EM_DASH
      ) : (
        <>
          <span className="block">
            {num(r.membershipBase)} → {num(r.membershipEnd)}
          </span>
          <span
            className={`block ${
              r.membershipNet != null && r.membershipNet < 0
                ? 'club-history-net club-history-net--neg'
                : 'club-history-net club-history-net--pos'
            }`}
          >
            {signedNet(r.membershipNet)}
          </span>
        </>
      ),
  },
  {
    id: 'renewals',
    label: 'Renewals',
    title: 'Renewals, October / April',
    render: r => `${num(r.octoberRenewals)} / ${num(r.aprilRenewals)}`,
  },
  {
    id: 'status',
    label: 'Status',
    sortField: 'status',
    render: r => r.clubStatus ?? EM_DASH,
  },
]

export interface ClubHistoryTableProps {
  rows: ClubHistoryRow[]
  clubName: string
  /** When provided (#1302), each year label becomes a deep link to
   *  ClubDetailPage focused on that program year (`?py=<startYear>`), so a user
   *  reading the multi-year table can jump into a single year. Omitted → plain
   *  text (keeps the component usable outside a Router).
   *
   *  #1803 — a row now knows its district (the club-district history), so
   *  the link goes straight to the club page in THAT year's district. A row
   *  without one keeps the district-agnostic `/club/:clubId` route (#1441),
   *  which resolves the district itself. Never the page's district: after the
   *  2026-07-01 reformation it is not a fact about the club's 2022 row. */
  clubId?: string | undefined
  /** #1803 — show each row's district (the page sets it when they vary). */
  showDistrict?: boolean
}

/* #1803 (Ron, 2026-10-15) — the current program year is read from its
   latest snapshot so far, not a year-end: say so in words. */
function InProgressTag() {
  return <span className="club-history-in-progress">in progress</span>
}

/** Where a row's year label links: that year's district when known. */
function yearHref(clubId: string, row: ClubHistoryRow): string {
  return row.districtId
    ? `/district/${row.districtId}/club/${clubId}?py=${row.startYear}`
    : `/club/${clubId}?py=${row.startYear}`
}

/* The history on the shared DataTable (#2733, #2676 M6). Sort only: eight
   columns at most, all shown. A column id is the sort field it sorts by; the
   District and Renewals columns have no sort. The component owns the order
   (manualSorting), as the regions leaderboard does. */
const historyFeatures = tableFeatures({
  rowSortingFeature,
  columnSizingFeature,
  columnVisibilityFeature,
})
type HistoryFeatures = typeof historyFeatures
const colHelper = createColumnHelper<HistoryFeatures, ClubHistoryRow>()
type HistoryColumns = ReturnType<typeof colHelper.columns>

/** Widths in px (8px padding per side included). The year takes the rest. */
const HISTORY_SIZES: Readonly<Record<string, number>> = {
  year: 200,
  district: 110,
  dcpGoals: 100,
  tier: 160,
  membershipNet: 190,
  renewals: 130,
  status: 100,
}

const TEXT_COLUMNS: ReadonlySet<string> = new Set([
  'year',
  'district',
  'tier',
  'status',
])

const headerClass = (id: string): string =>
  [
    id === 'year' ? 'rankings-sticky-col' : '',
    TEXT_COLUMNS.has(id) ? '' : 'dt-num',
  ]
    .filter(Boolean)
    .join(' ')

const cellClass = (id: string): string =>
  [
    'rankings-cell',
    id === 'year' ? 'rankings-sticky-col' : '',
    TEXT_COLUMNS.has(id) ? '' : 'rankings-cell--num',
  ]
    .filter(Boolean)
    .join(' ')

const HistoryDataTable: React.FC<{
  rows: readonly ClubHistoryRow[]
  columns: HistoryColumns
  clubName: string
  sort: { field: SortField; direction: SortDirection }
  onSort: (field: SortField) => void
  inScroller: boolean
}> = ({ rows, columns, clubName, sort, onSort, inScroller }) => {
  const table = useTable<HistoryFeatures, ClubHistoryRow>({
    features: historyFeatures,
    data: rows as ClubHistoryRow[],
    columns,
    getRowId: r => String(r.startYear),
    state: { columnSizing: HISTORY_SIZES },
    manualSorting: true,
  })
  return (
    <DataTable
      table={table}
      id={inScroller ? 'club-history-sheet-table' : 'club-history-table'}
      label={`${clubName} program-year history`}
      caption={`${clubName} performance by program year, ${rows.length} ${
        rows.length === 1 ? 'program year' : 'program years'
      }. Column headers with buttons are sortable.`}
      sort={sort}
      onSort={id => onSort(id as SortField)}
      rowHeaderColumnId="year"
      headerClassName={headerClass}
      cellClassName={cellClass}
      rowClassName="rankings-row"
      inScroller={inScroller}
      overflowHint="Scroll sideways for more columns"
    />
  )
}

export function ClubHistoryTable({
  rows,
  clubName,
  clubId,
  showDistrict = false,
}: ClubHistoryTableProps) {
  const [sortField, setSortField] = useState<SortField>('year')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  const currentSort = { field: sortField, direction: sortDirection }

  const handleSort = (field: SortField) => {
    if (field === sortField) {
      setSortDirection(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      // Year defaults to newest-first; the rest read most-naturally ascending.
      setSortDirection(field === 'year' ? 'desc' : 'asc')
    }
  }

  const sortedRows = useMemo(() => {
    const keyed = (r: ClubHistoryRow): number | string => {
      switch (sortField) {
        case 'year':
          return r.startYear
        case 'dcpGoals':
          return r.dcpGoals ?? -1
        case 'tier':
          return tierRank(r.tierCode)
        case 'membershipNet':
          return r.membershipNet ?? Number.NEGATIVE_INFINITY
        case 'status':
          return r.clubStatus ?? ''
      }
    }
    const dir = sortDirection === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const ka = keyed(a)
      const kb = keyed(b)
      if (ka < kb) return -1 * dir
      if (ka > kb) return 1 * dir
      // Stable tiebreak on program year (newest first) so equal keys are deterministic.
      return b.startYear - a.startYear
    })
  }, [rows, sortField, sortDirection])

  const columns = colHelper.columns([
    colHelper.accessor(r => r.startYear, {
      id: 'year',
      header: 'Program year',
      cell: info => {
        const row = info.row.original
        return (
          <>
            {clubId ? (
              <Link
                to={yearHref(clubId, row)}
                className="club-history-year-link"
              >
                {row.label}
              </Link>
            ) : (
              row.label
            )}
            {row.inProgress && <InProgressTag />}
          </>
        )
      },
    }),
    ...(showDistrict
      ? [
          colHelper.display({
            id: 'district',
            header: 'District',
            cell: info =>
              info.row.original.districtId
                ? lifecycleDistrictLabel(info.row.original.districtId)
                : EM_DASH,
          }),
        ]
      : []),
    colHelper.accessor(r => r.dcpGoals ?? -1, {
      id: 'dcpGoals',
      header: 'DCP goals',
      cell: info => {
        const goals = info.row.original.dcpGoals
        return goals == null ? EM_DASH : `${goals} / 10`
      },
    }),
    colHelper.accessor(r => tierRank(r.tierCode), {
      id: 'tier',
      header: 'Distinguished',
      cell: info =>
        // The tier is plain text (no pill, #2676 spec §3.2).
        info.row.original.tierCode ? (
          <span className="dt-tier">{info.row.original.tierLabel}</span>
        ) : (
          <span className="dt-tier dt-tier--none">
            <span aria-hidden="true">{EM_DASH}</span>
            <span className="sr-only">Not distinguished</span>
          </span>
        ),
    }),
    colHelper.accessor(r => r.membershipNet ?? Number.NEGATIVE_INFINITY, {
      id: 'membershipNet',
      header: 'Membership (base → end)',
      cell: info => {
        const row = info.row.original
        return row.membershipBase == null && row.membershipEnd == null ? (
          EM_DASH
        ) : (
          <>
            {num(row.membershipBase)} → {num(row.membershipEnd)}{' '}
            <span
              className={
                row.membershipNet != null && row.membershipNet < 0
                  ? 'club-history-net club-history-net--neg'
                  : 'club-history-net club-history-net--pos'
              }
            >
              ({signedNet(row.membershipNet)})
            </span>
          </>
        )
      },
    }),
    colHelper.display({
      id: 'renewals',
      header: 'Renewals (Oct / Apr)',
      cell: info =>
        `${num(info.row.original.octoberRenewals)} / ${num(info.row.original.aprilRenewals)}`,
    }),
    colHelper.accessor(r => r.clubStatus ?? '', {
      id: 'status',
      header: 'Status',
      cell: info => info.row.original.clubStatus ?? EM_DASH,
    }),
  ])

  const historyTable = (variant: 'page' | 'sheet') => (
    <HistoryDataTable
      rows={sortedRows}
      columns={columns}
      clubName={clubName}
      sort={currentSort}
      onSort={handleSort}
      inScroller={variant === 'sheet'}
    />
  )

  // Below 768 (#1834): year + 2 chosen metrics, no side-scroll, the tier as
  // a short chip that fits its cell (Lesson 134); the complete table moves
  // into the full-screen sheet. ≥768 renders the scroll region unchanged.
  return (
    <PriorityColumnsTable<ClubHistoryRow, SortField>
      label={`${clubName} program-year history`}
      rows={sortedRows}
      rowKey={r => String(r.startYear)}
      identityHeader="Year"
      identitySortField="year"
      renderIdentity={r => (
        <>
          {clubId ? <Link to={yearHref(clubId, r)}>{r.label}</Link> : r.label}
          {r.inProgress && <InProgressTag />}
          {/* #1803 — phones name the year's district under the year. */}
          {showDistrict && r.districtId && (
            <span className="club-history-district">
              {lifecycleDistrictLabel(r.districtId)}
            </span>
          )}
        </>
      )}
      metrics={PHONE_METRICS}
      defaultMetricIds={['dcpGoals', 'tier']}
      sort={currentSort}
      onSort={handleSort}
      fullTableTitle={`${clubName} — all columns`}
      sheetTable={historyTable('sheet')}
      fullTable={
        // >=768: the shared DataTable. The header sticks to the page while the
        // columns fit; only when they cannot does it scroll sideways, as a
        // labelled, focusable region with edge cues (WCAG 2.1.1).
        <div className="districts-rankings-table-wrap districts-rankings-table-wrap--dt">
          {historyTable('page')}
        </div>
      }
    />
  )
}
