import React, { useMemo } from 'react'
import {
  columnSizingFeature,
  columnVisibilityFeature,
  createColumnHelper,
  rowSortingFeature,
  tableFeatures,
  useTable,
} from '@tanstack/react-table'
import { Link, useSearchParams } from 'react-router-dom'
import type { RegionRollup } from '../utils/aggregateRegions'
import { useUrlSort } from '../hooks/useUrlSort'
import {
  PriorityColumnsTable,
  type PriorityMetric,
} from './PriorityColumnsTable'
import { DistrictTrendSparkline } from './DistrictTrendSparkline'
import { DataTable } from './dataTable/DataTable'
import {
  regionTrainingUrl,
  type RegionsTrainingOverview,
} from '../utils/regionTraining'
import {
  formatPct,
  roundMonths,
  type TrainingRound,
} from '../utils/officerTraining'
import { formatShortDate } from '../utils/dateFormatting'

/* RegionsLeaderboard (#494, restored #964) — the PRIMARY sortable table for
   the /regions overview. 14 region rows × six columns.

   Sort state is URL-synced (?sort=&dir=) via the shared useUrlSort +
   SortableHeader infra (#851/#857), so reload, back/forward, and shared links
   carry the sort. The DEFAULT sort is region number ascending (#964) — a fixed
   navigation list of the 14 regions reads best in a stable, predictable order
   (matches the RegionFinder), and the table OWNS that order rather than leaning
   on the order rollups happen to arrive in (Lesson 138 / #882).

   useUrlSort validates the ?sort field against SORT_FIELDS and falls back to
   the default for any unknown value, so a hand-edited / shared URL can't seed
   an out-of-range sort (Lesson 144). The ?sort/?dir params are disjoint from
   the page's ?region finder param and are written by a distinct gesture, so
   there is no same-batch setSearchParams race (Lesson 070/145). */

export interface RegionsLeaderboardProps {
  rollups: ReadonlyArray<RegionRollup>
  /**
   * Membership sparkline values per region (#2127), from the one
   * time-series/regions/{PY}.json file. `'loading'` = the column is
   * reserved, no line yet; omitted or `null` = the file is not published
   * (no Trend column, no sparkline — the table is as it was).
   */
  trends?: RegionTrends
  /**
   * Officer training per region (#2330), from the date's
   * region-rollups.json. `'loading'` = the columns are reserved; omitted or
   * `null` = no training columns. A date without the figures still passes
   * an overview, so the cells say "not available".
   */
  training?: RegionsTrainingOverview | 'loading' | null
}

export type RegionTrends =
  ReadonlyMap<string, number[] | null> | 'loading' | null

const SORT_FIELDS = [
  'region',
  'districts',
  'paidClubs',
  'payments',
  'distinguished',
  'score',
  'r1Dcp',
  'r1AllSeven',
  'r2Dcp',
  'r2AllSeven',
] as const
type SortField = (typeof SORT_FIELDS)[number]

type TrainingMetric = 'Dcp' | 'AllSeven'
type TrainingField = `r${TrainingRound}${TrainingMetric}`

const TRAINING_COLUMNS: ReadonlyArray<{
  field: TrainingField
  round: TrainingRound
  metric: TrainingMetric
}> = [
  { field: 'r1Dcp', round: 1, metric: 'Dcp' },
  { field: 'r1AllSeven', round: 1, metric: 'AllSeven' },
  { field: 'r2Dcp', round: 2, metric: 'Dcp' },
  { field: 'r2AllSeven', round: 2, metric: 'AllSeven' },
]

/* Labels follow the region Training page (#2296): "4+" is DCP goal 9's
   round requirement, "All 7" every officer. */
const METRIC_LABEL: Record<TrainingMetric, string> = {
  Dcp: '4+',
  AllSeven: 'All 7',
}
const METRIC_PHRASE: Record<TrainingMetric, string> = {
  Dcp: 'clubs with 4+ officers trained (DCP goal 9)',
  AllSeven: 'clubs with all seven officers trained',
}

/** A region's % in a training column; null = not started / not available. */
const trainingValue = (
  training: RegionsTrainingOverview | 'loading' | null | undefined,
  region: string,
  round: TrainingRound,
  metric: TrainingMetric
): number | null => {
  if (!training || training === 'loading') return null
  const r = training.forRegion(region).rounds[round - 1]!
  if (r.state !== 'measured') return null
  return metric === 'Dcp' ? r.figures.pctDcp : r.figures.pctAllSeven
}

/** Numeric sort key for a region row, per field. region sorts by its numeric
 *  value (01, 02, … 14), not lexically. */
const sortValue = (
  field: Exclude<SortField, TrainingField>,
  r: RegionRollup
): number => {
  switch (field) {
    case 'region':
      return Number(r.region)
    case 'districts':
      return r.districtCount
    case 'paidClubs':
      return r.paidClubs
    case 'payments':
      return r.totalPayments
    case 'distinguished':
      return r.distinguishedClubs
    case 'score':
      return r.aggregateScore
  }
}

const isTrainingField = (field: SortField): field is TrainingField =>
  TRAINING_COLUMNS.some(c => c.field === field)

/* Phone priority columns (#1834): the metrics a visitor can pick 2 of.
   Same fields as the full table's cells. Distinguished stacks count over
   percent so the cell fits a third of a phone. */
const BASE_PHONE_METRICS: PriorityMetric<RegionRollup, SortField>[] = [
  {
    id: 'districts',
    label: 'Districts',
    sortField: 'districts',
    render: r => r.districtCount,
  },
  {
    id: 'paidClubs',
    label: 'Paid clubs',
    sortField: 'paidClubs',
    render: r => r.paidClubs.toLocaleString(),
  },
  {
    id: 'payments',
    label: 'Payments',
    sortField: 'payments',
    render: r => r.totalPayments.toLocaleString(),
  },
  {
    id: 'distinguished',
    label: 'Dist. clubs',
    title: 'Distinguished clubs, and as a share of paid clubs',
    sortField: 'distinguished',
    render: r => (
      <>
        <span className="block">{r.distinguishedClubs.toLocaleString()}</span>
        <span className="block text-gray-600 theme-dark:text-gray-300">
          {Math.round(r.distinguishedPercent)}%
        </span>
      </>
    ),
  },
  {
    id: 'score',
    label: 'Score',
    sortField: 'score',
    render: r => (
      <span className="font-semibold">{r.aggregateScore.toLocaleString()}</span>
    ),
  },
]

/* The leaderboard on the shared DataTable (#2702, #2676 M3). Sort only: it has
   a handful of columns, so it shows all of them and offers no Columns menu.
   A column is a field the URL sort knows; the round columns are sortable only
   once the round has started. The old two-row header (a "Round 1" group over
   "4+" and "All 7") is a single row now, so each column names itself. */
const leaderboardFeatures = tableFeatures({
  rowSortingFeature,
  columnSizingFeature,
  columnVisibilityFeature,
})
type LeaderboardFeatures = typeof leaderboardFeatures
const colHelper = createColumnHelper<LeaderboardFeatures, RegionRollup>()
type LeaderboardColumns = ReturnType<typeof colHelper.columns>

/** Fixed widths in px (8px padding per side included); Region takes the rest. */
const LEADERBOARD_SIZES: Readonly<Record<string, number>> = {
  region: 176,
  trend: 80,
  districts: 88,
  paidClubs: 80,
  payments: 88,
  distinguished: 112,
  score: 72,
  r1Dcp: 96,
  r1AllSeven: 96,
  r2Dcp: 96,
  r2AllSeven: 96,
  r1: 128,
  r2: 128,
}

const LEADERBOARD_TEXT_COLUMNS: ReadonlySet<string> = new Set([
  'region',
  'trend',
])

const leaderboardHeaderClass = (id: string): string =>
  [
    id === 'region' ? 'rankings-sticky-col' : '',
    LEADERBOARD_TEXT_COLUMNS.has(id) ? '' : 'dt-num',
  ]
    .filter(Boolean)
    .join(' ')

const leaderboardCellClass = (id: string): string =>
  [
    'rankings-cell',
    id === 'region'
      ? 'rankings-sticky-col'
      : LEADERBOARD_TEXT_COLUMNS.has(id)
        ? ''
        : 'rankings-cell--num',
  ]
    .filter(Boolean)
    .join(' ')

const LeaderboardTable: React.FC<{
  rows: readonly RegionRollup[]
  columns: LeaderboardColumns
  sort: { field: SortField; direction: 'asc' | 'desc' }
  onSort: (field: SortField) => void
  inScroller: boolean
}> = ({ rows, columns, sort, onSort, inScroller }) => {
  const table = useTable<LeaderboardFeatures, RegionRollup>({
    features: leaderboardFeatures,
    data: rows as RegionRollup[],
    columns,
    getRowId: r => r.region,
    state: { columnSizing: LEADERBOARD_SIZES },
    // The component owns the order (region number by default, Lesson 138).
    manualSorting: true,
  })
  return (
    <DataTable
      table={table}
      id={
        inScroller
          ? 'regions-leaderboard-sheet-table'
          : 'regions-leaderboard-table'
      }
      label="Region rankings"
      tableLabel="Region rankings"
      caption={`Region rankings, ${rows.length} ${
        rows.length === 1 ? 'region' : 'regions'
      }. Column headers with buttons are sortable.`}
      sort={sort}
      onSort={id => onSort(id as SortField)}
      rowHeaderColumnId="region"
      headerClassName={leaderboardHeaderClass}
      cellClassName={leaderboardCellClass}
      rowClassName="rankings-row"
      inScroller={inScroller}
    />
  )
}

export const RegionsLeaderboard: React.FC<RegionsLeaderboardProps> = ({
  rollups,
  trends,
  training,
}) => {
  const [searchParams] = useSearchParams()
  const showTraining = training !== undefined && training !== null
  const overview = training && training !== 'loading' ? training : null
  // A round that has not opened has nothing to compare (every club reads
  // 0): a plain header, no sort (as on the region Training page).
  const round2Started = overview ? overview.round2Started : true
  const sortable = (round: TrainingRound) => round === 1 || round2Started
  const showTrend = trends !== undefined && trends !== null
  // A region the file holds no line for reads "no trend" in words; while
  // the file loads every cell is reserved (undefined).
  const trendOf = (region: string): number[] | null | undefined =>
    typeof trends === 'object' && trends !== null
      ? (trends.get(region) ?? null)
      : undefined
  // URL-synced click-header sort. Default: region number ascending (#964).
  // A new-column click starts descending (metric columns read "best first").
  const { sort, toggleSort } = useUrlSort<SortField>({
    fields: SORT_FIELDS,
    defaultField: 'region',
    defaultDirection: 'asc',
    newFieldDirection: 'desc',
  })

  const sorted = useMemo(() => {
    const dir = sort.direction === 'asc' ? 1 : -1
    const field = sort.field
    if (isTrainingField(field)) {
      const col = TRAINING_COLUMNS.find(c => c.field === field)!
      const value = (r: RegionRollup) =>
        trainingValue(training, r.region, col.round, col.metric)
      // Regions without a figure go last in either direction; ties by
      // region number.
      return [...rollups].sort((a, b) => {
        const va = value(a)
        const vb = value(b)
        if (va === null || vb === null)
          return va === vb
            ? Number(a.region) - Number(b.region)
            : va === null
              ? 1
              : -1
        return (va - vb) * dir || Number(a.region) - Number(b.region)
      })
    }
    return [...rollups].sort(
      (a, b) => (sortValue(field, a) - sortValue(field, b)) * dir
    )
  }, [rollups, sort, training])

  const trainingLink = (region: string) =>
    regionTrainingUrl(region, {
      py: searchParams.get('py'),
      date: searchParams.get('date'),
    })

  /** One training figure: a link to the region's Training page, or why
   *  there is no figure ("not started", "not available") in words. */
  const trainingCell = (
    region: string,
    round: TrainingRound,
    metric: TrainingMetric
  ): React.ReactNode => {
    if (training === 'loading')
      return (
        <span className="region-training-cell__muted" aria-label="Loading">
          …
        </span>
      )
    if (!overview) return null
    const r = overview.forRegion(region).rounds[round - 1]!
    if (r.state === 'notStarted')
      return <span className="region-training-cell__muted">not started</span>
    if (r.state === 'notAvailable')
      return <span className="region-training-cell__muted">not available</span>
    const pct = formatPct(
      metric === 'Dcp' ? r.figures.pctDcp : r.figures.pctAllSeven
    )
    return (
      <Link
        to={trainingLink(region)}
        aria-label={`Region ${region} Round ${round}: ${pct} of ${METRIC_PHRASE[metric]}`}
        className="text-tm-loyal-blue hover:underline"
      >
        {pct}
      </Link>
    )
  }

  /** The phone training cell (#2330): the current round, 4+ over all
   *  seven (as Dist. clubs stacks count over %). */
  const phoneTrainingCell = (
    region: string,
    round: TrainingRound
  ): React.ReactNode => {
    const r = overview && overview.forRegion(region).rounds[round - 1]!
    if (!r || r.state !== 'measured') return trainingCell(region, round, 'Dcp')
    const dcp = formatPct(r.figures.pctDcp)
    const all = formatPct(r.figures.pctAllSeven)
    return (
      <Link
        to={trainingLink(region)}
        aria-label={`Region ${region} Round ${round}: ${dcp} of ${METRIC_PHRASE.Dcp}, ${all} with all seven`}
        className="text-tm-loyal-blue hover:underline"
      >
        <span className="block">{dcp}</span>
        <span className="block text-gray-600 theme-dark:text-gray-300">
          {all} all 7
        </span>
      </Link>
    )
  }

  /* Phones get ONE training chip (#2330), for the round the date ranks
     on: more chips pushed the table past the 375 first-content budget
     (mobile-375-gate). The sheet's full table keeps both rounds. */
  const phoneRound: TrainingRound = overview ? overview.currentRound : 1
  const phoneMetrics: PriorityMetric<RegionRollup, SortField>[] = showTraining
    ? [
        ...BASE_PHONE_METRICS,
        {
          id: 'training',
          // "R1 training" ellipsized at 375 with Linux fonts; the round is
          // in the title and each cell's accessible name.
          label: 'Training',
          title: `Round ${phoneRound} officer training: % of ${METRIC_PHRASE.Dcp}, and with all seven`,
          ...(sortable(phoneRound)
            ? { sortField: `r${phoneRound}Dcp` as SortField }
            : {}),
          render: (r: RegionRollup) => phoneTrainingCell(r.region, phoneRound),
        },
      ]
    : BASE_PHONE_METRICS

  if (rollups.length === 0) {
    return (
      <p className="text-sm text-gray-500 theme-dark:text-gray-400 italic px-4 py-6">
        No regions to display.
      </p>
    )
  }

  /* A round is split into 4+ and All 7 only when some region has a figure
     for it (#2334 review): before it opens, or on a date without the
     figures, it is ONE narrow column, so the table fits its container at
     1024 and 1280 instead of spending two columns on "not started". */
  const expanded = (round: TrainingRound): boolean =>
    !!overview &&
    [...overview.regions.values()].some(
      b => b.rounds[round - 1]!.state === 'measured'
    )

  /** A round column: sortable once the round has started. */
  const trainingColumn = (
    id: string,
    header: string,
    round: TrainingRound,
    metric: TrainingMetric
  ) => {
    const cell = (r: RegionRollup) => trainingCell(r.region, round, metric)
    return sortable(round)
      ? colHelper.accessor(
          r => trainingValue(training, r.region, round, metric) ?? -1,
          { id, header, cell: info => cell(info.row.original) }
        )
      : colHelper.display({
          id,
          header,
          cell: info => cell(info.row.original),
        })
  }

  const roundColumns = ([1, 2] as const).flatMap(round =>
    expanded(round)
      ? [
          trainingColumn(
            `r${round}Dcp`,
            `Round ${round}: ${METRIC_LABEL.Dcp} officers trained`,
            round,
            'Dcp'
          ),
          trainingColumn(
            `r${round}AllSeven`,
            `Round ${round}: ${METRIC_LABEL.AllSeven} officers trained`,
            round,
            'AllSeven'
          ),
        ]
      : [
          colHelper.display({
            id: `r${round}`,
            header: `Round ${round} training, ${
              round === 2 && overview && !overview.round2Started
                ? `opens ${formatShortDate(overview.round2Opens)}`
                : roundMonths(round)
            }`,
            cell: info => trainingCell(info.row.original.region, round, 'Dcp'),
          }),
        ]
  )

  const columns = colHelper.columns([
    colHelper.accessor(r => Number(r.region), {
      id: 'region',
      header: 'Region',
      cell: info => {
        const r = info.row.original
        return (
          <Link
            to={`/region/${r.region}`}
            aria-label={`Region ${r.region} \u2014 leader ${r.leadingDistrictName}`}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 min-h-[44px] text-tm-loyal-blue hover:underline"
          >
            <span
              className="inline-block whitespace-nowrap px-2 py-0.5 text-sm font-mono rounded bg-tm-loyal-blue/10 text-tm-loyal-blue theme-dark:bg-tm-loyal-blue/30 theme-dark:text-blue-200"
              aria-hidden="true"
            >
              Region {r.region}
            </span>
            <span className="whitespace-nowrap text-gray-700 theme-dark:text-gray-200 text-sm">
              leader: {r.leadingDistrictName}
            </span>
          </Link>
        )
      },
    }),
    ...(showTrend
      ? [
          colHelper.display({
            id: 'trend',
            header: 'Trend',
            cell: info => (
              <span data-testid="region-trend-cell">
                <DistrictTrendSparkline
                  series={trendOf(info.row.original.region)}
                />
              </span>
            ),
          }),
        ]
      : []),
    colHelper.accessor(r => r.districtCount, {
      id: 'districts',
      header: 'Districts',
      cell: info => info.row.original.districtCount,
    }),
    colHelper.accessor(r => r.paidClubs, {
      id: 'paidClubs',
      header: 'Paid clubs',
      cell: info => info.row.original.paidClubs.toLocaleString(),
    }),
    colHelper.accessor(r => r.totalPayments, {
      id: 'payments',
      header: 'Payments',
      cell: info => info.row.original.totalPayments.toLocaleString(),
    }),
    colHelper.accessor(r => r.distinguishedClubs, {
      id: 'distinguished',
      header: 'Distinguished',
      cell: info => (
        <>
          {info.row.original.distinguishedClubs.toLocaleString()}
          <span className="text-gray-600 theme-dark:text-gray-300 ml-1">
            {'\u00b7'} {Math.round(info.row.original.distinguishedPercent)}%
          </span>
        </>
      ),
    }),
    colHelper.accessor(r => r.aggregateScore, {
      id: 'score',
      header: 'Score',
      cell: info => (
        <span className="font-semibold text-gray-900 theme-dark:text-gray-50">
          {info.row.original.aggregateScore.toLocaleString()}
        </span>
      ),
    }),
    ...(showTraining ? roundColumns : []),
  ])

  const leaderboardTable = (variant: 'page' | 'sheet') => (
    <LeaderboardTable
      rows={sorted}
      columns={columns}
      sort={sort}
      onSort={toggleSort}
      inScroller={variant === 'sheet'}
    />
  )

  // Below 768 (#1834): region + 2 chosen metrics, no side-scroll; the
  // complete table moves into the full-screen sheet. ≥768 is unchanged.
  return (
    <PriorityColumnsTable<RegionRollup, SortField>
      label="Region rankings"
      rows={sorted}
      rowKey={r => r.region}
      identityHeader="Region"
      identitySortField="region"
      renderIdentity={r => (
        <Link
          to={`/region/${r.region}`}
          aria-label={`Region ${r.region} — leader ${r.leadingDistrictName}`}
          className={showTrend ? 'region-identity' : undefined}
        >
          <span className="font-semibold">Region {r.region}</span>
          <span className="truncate text-gray-600 theme-dark:text-gray-300">
            lead D{r.leadingDistrictId}
          </span>
          {/* Own line under the label (as on /region/:n, #1815): beside it
              the 60px line would clip the identity at 375 (Lesson 134). */}
          {showTrend && (
            <span className="region-identity__trend">
              <DistrictTrendSparkline series={trendOf(r.region)} />
            </span>
          )}
        </Link>
      )}
      metrics={phoneMetrics}
      defaultMetricIds={['paidClubs', 'score']}
      sort={sort}
      onSort={toggleSort}
      fullTableTitle="Regions — all columns"
      sheetTable={leaderboardTable('sheet')}
      fullTable={
        // >=768: the shared DataTable. The header sticks to the page while the
        // columns fit; only when they cannot does it scroll sideways, as a
        // labelled, focusable region with edge cues (WCAG 2.1.1).
        <div className="districts-rankings-table-wrap districts-rankings-table-wrap--dt">
          {leaderboardTable('page')}
        </div>
      }
    />
  )
}
