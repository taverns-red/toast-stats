import React, { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { RegionRollup } from '../utils/aggregateRegions'
import { useUrlSort } from '../hooks/useUrlSort'
import { SortableHeader } from '../components/SortableHeader'
import {
  PriorityColumnsTable,
  type PriorityMetric,
} from './PriorityColumnsTable'
import { DistrictTrendSparkline } from './DistrictTrendSparkline'
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

const HEADER_TH =
  'px-4 py-3 text-xs font-medium uppercase tracking-wider text-gray-500'
// Not sortable: a plain header, sentence case like the sortable labels.
const TREND_TH =
  'px-4 py-3 text-xs font-medium tracking-wider text-gray-500 text-left align-top'
// Training headers (#2330): sentence case like the sortable labels.
const TRAINING_TH = 'px-4 py-3 text-xs font-medium tracking-wider text-gray-500'
const TRAINING_TD =
  'px-3 py-3 tabular-nums text-gray-700 theme-dark:text-gray-200 region-training-cell'
const NUMERIC_TD =
  'px-4 py-3 text-right tabular-nums text-gray-700 theme-dark:text-gray-200'

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

  const span = showTraining ? 2 : 1
  /* A round is split into 4+ and All 7 only when some region has a figure
     for it (#2334 review): before it opens, or on a date without the
     figures, it is ONE narrow column, so the table fits its container at
     1024 and 1280 instead of spending two columns on "not started". */
  const expanded = (round: TrainingRound): boolean =>
    !!overview &&
    [...overview.regions.values()].some(
      b => b.rounds[round - 1]!.state === 'measured'
    )
  const roundHeader = (round: TrainingRound) =>
    expanded(round) ? (
      <th
        key={`round-${round}`}
        scope="colgroup"
        colSpan={2}
        className={`${TRAINING_TH} text-center region-training-group`}
      >
        <span className="region-training-group__part">
          Round {round} training
        </span>{' '}
        <span className="region-training-group__part">
          {roundMonths(round)}
        </span>
      </th>
    ) : (
      <th
        key={`round-${round}`}
        scope="col"
        rowSpan={2}
        className={`${TRAINING_TH} text-right region-training-group region-training-group--single`}
      >
        <span className="region-training-group__part">
          Round {round} training
        </span>{' '}
        <span className="region-training-group__part">
          {round === 2 && overview && !overview.round2Started
            ? `opens ${formatShortDate(overview.round2Opens)}`
            : roundMonths(round)}
        </span>
      </th>
    )

  /** A row's cells for a round: one cell (its state in words) when the
   *  round is a single column or the region has no figure, else 4+ and
   *  All 7. */
  const trainingCells = (region: string, round: TrainingRound) => {
    if (!expanded(round))
      return (
        <td key={`r${round}`} className={`${TRAINING_TD} text-right`}>
          {trainingCell(region, round, 'Dcp')}
        </td>
      )
    const r = overview && overview.forRegion(region).rounds[round - 1]!.state
    if (r === 'notStarted' || r === 'notAvailable')
      return (
        <td
          key={`r${round}`}
          colSpan={2}
          className={`${TRAINING_TD} text-center`}
        >
          {trainingCell(region, round, 'Dcp')}
        </td>
      )
    return (['Dcp', 'AllSeven'] as const).map(metric => (
      <td key={`r${round}${metric}`} className={`${TRAINING_TD} text-right`}>
        {trainingCell(region, round, metric)}
      </td>
    ))
  }

  const fullTable = (
    <table
      className={`region-leaderboard-table w-full text-sm font-tm-body${
        showTraining ? ' region-leaderboard-table--training' : ''
      }`}
      aria-label="Region rankings"
    >
      <thead className="border-b border-gray-200 theme-dark:border-gray-700">
        <tr>
          <SortableHeader<SortField>
            field="region"
            rowSpan={span}
            label="Region"
            currentSort={sort}
            onSort={toggleSort}
            thClassName={`${HEADER_TH} text-left region-leaderboard__sticky-col`}
          />
          {showTrend && (
            <th
              scope="col"
              rowSpan={span}
              title="Membership this program year"
              className={TREND_TH}
            >
              Trend
            </th>
          )}
          <SortableHeader<SortField>
            field="districts"
            rowSpan={span}
            label="Districts"
            currentSort={sort}
            onSort={toggleSort}
            thClassName={`${HEADER_TH} text-right`}
            numeric
          />
          <SortableHeader<SortField>
            field="paidClubs"
            rowSpan={span}
            label="Paid Clubs"
            currentSort={sort}
            onSort={toggleSort}
            thClassName={`${HEADER_TH} text-right`}
            numeric
          />
          <SortableHeader<SortField>
            field="payments"
            rowSpan={span}
            label="Payments"
            currentSort={sort}
            onSort={toggleSort}
            thClassName={`${HEADER_TH} text-right`}
            numeric
          />
          <SortableHeader<SortField>
            field="distinguished"
            rowSpan={span}
            label="Distinguished"
            currentSort={sort}
            onSort={toggleSort}
            thClassName={`${HEADER_TH} text-right`}
            numeric
          />
          <SortableHeader<SortField>
            field="score"
            rowSpan={span}
            label="Score"
            currentSort={sort}
            onSort={toggleSort}
            thClassName={`${HEADER_TH} text-right`}
            numeric
          />
          {showTraining && ([1, 2] as const).map(roundHeader)}
        </tr>
        {showTraining && (
          <tr>
            {TRAINING_COLUMNS.filter(c => expanded(c.round)).map(c =>
              sortable(c.round) ? (
                <SortableHeader<SortField>
                  key={c.field}
                  field={c.field}
                  label={METRIC_LABEL[c.metric]}
                  currentSort={sort}
                  onSort={toggleSort}
                  thClassName={`${HEADER_TH} text-right`}
                  numeric
                />
              ) : (
                <th
                  key={c.field}
                  scope="col"
                  className={`${TRAINING_TH} text-right`}
                >
                  {METRIC_LABEL[c.metric]}
                </th>
              )
            )}
          </tr>
        )}
      </thead>
      <tbody className="divide-y divide-gray-100 theme-dark:divide-gray-800">
        {sorted.map(r => (
          <tr
            key={r.region}
            className="hover:bg-gray-50 theme-dark:hover:bg-gray-800/50 transition-colors"
          >
            <td className="region-leaderboard__sticky-col px-4 py-3 text-left">
              <Link
                to={`/region/${r.region}`}
                aria-label={`Region ${r.region} — leader ${r.leadingDistrictName}`}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 text-tm-loyal-blue hover:underline"
              >
                <span
                  className="inline-block whitespace-nowrap px-2 py-0.5 text-xs font-mono rounded bg-tm-loyal-blue/10 text-tm-loyal-blue theme-dark:bg-tm-loyal-blue/30 theme-dark:text-blue-200"
                  aria-hidden="true"
                >
                  Region {r.region}
                </span>
                <span className="whitespace-nowrap text-gray-700 theme-dark:text-gray-200 text-xs">
                  leader: {r.leadingDistrictName}
                </span>
              </Link>
            </td>
            {showTrend && (
              <td
                data-testid="region-trend-cell"
                className="px-3 py-3 whitespace-nowrap"
              >
                <DistrictTrendSparkline series={trendOf(r.region)} />
              </td>
            )}
            <td className={NUMERIC_TD}>{r.districtCount}</td>
            <td className={NUMERIC_TD}>{r.paidClubs.toLocaleString()}</td>
            <td className={NUMERIC_TD}>{r.totalPayments.toLocaleString()}</td>
            <td className={NUMERIC_TD}>
              {r.distinguishedClubs.toLocaleString()}
              <span className="text-gray-500 theme-dark:text-gray-400 ml-1">
                · {Math.round(r.distinguishedPercent)}%
              </span>
            </td>
            <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-900 theme-dark:text-gray-50">
              {r.aggregateScore.toLocaleString()}
            </td>
            {showTraining &&
              ([1, 2] as const).flatMap(round =>
                trainingCells(r.region, round)
              )}
          </tr>
        ))}
      </tbody>
    </table>
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
      sheetTable={fullTable}
      fullTable={
        // ≥768: intentional, documented horizontal scroll (#689). role=region
        // + tabIndex + aria-label make the overflow keyboard-operable (WCAG
        // 2.1.1); the scroll-cue overlay (in the relative wrap) signals more
        // columns to the right.
        <div className="region-rankings__scroll-wrap">
          <div
            className="overflow-x-auto region-rankings__scroll"
            role="region"
            tabIndex={0}
            aria-label="Region rankings — scroll horizontally to see all metrics"
          >
            {fullTable}
          </div>
          <div className="region-rankings__scroll-cue" aria-hidden="true" />
        </div>
      }
    />
  )
}
