/* RegionPage (#423) — landing page for a single Toastmasters region.
   Lists every district in that region with a small KPI strip + ranking
   table. Reuses the same rankings data as DistrictsPage (shared
   React-Query cache). */

import { useDocumentTitle } from '../hooks/useDocumentTitle'
import React from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchCdnRankings, fetchCdnRankingsForDate } from '../services/cdn'
import { RegionPageLoadingShell } from '../components/RegionLoadingShells'
import { EmptyState, ErrorDisplay } from '../components/ErrorDisplay'
import type { DistrictRanking } from '../types/districts'
import { computeTiedRanks } from '../utils/tieRankingUtils'
import { useCompetitiveAwards } from '../hooks/useCompetitiveAwards'
import { useProgramYearControls } from '../hooks/useProgramYearControls'
import { DataControlsBar } from '../components/DataControlsBar'
import { ContextBar } from '../components/ContextBar'
import { ContextSheetControls } from '../components/ContextSheetControls'
import { formatFreshnessLine } from '../utils/contextBar'
import type { DistinguishedDistrictTier } from '../services/cdn'
import { DistrictChipAndName } from '../components/DistrictChipAndName'
import { useUrlSort } from '../hooks/useUrlSort'
import {
  PriorityColumnsTable,
  type PriorityMetric,
} from '../components/PriorityColumnsTable'
import { DistrictTrendSparkline } from '../components/DistrictTrendSparkline'
import { RegionDistrictRankingsTable } from '../components/RegionDistrictRankingsTable'
import type { RegionRankedDistrict } from '../components/regionRankingsTableFeatures'
import { RegionSubnav } from '../components/rollups/RegionSubnav'
import { useDistrictTrends } from '../hooks/useDistrictTrends'
import { normaliseRegionId } from '../utils/regionId'
import { signedDelta, signedPercent } from '../utils/displayFormat'
import {
  DistinguishedBasisNote,
  DistinguishedCount,
} from '../components/DistinguishedCount'
import { useRegionRollups } from '../hooks/useRegionRollups'
import {
  districtProvisionalMap,
  regionDistinguishedCounts,
} from '../utils/rollupDistinguished'
import { regionMembershipFor } from '../utils/regionHistory'
import { useDistrictRegionHistory } from '../hooks/useDistrictRegionHistory'
import { RegionRecognitionScoreboard } from '../components/RegionRecognitionScoreboard'
import { buildRecognitionScoreboard } from '../utils/regionRecognition'
import { useRegionPace } from '../hooks/useRegionPace'
import { useIsMobile } from '../hooks/useIsMobile'

const REGION_SORT_FIELDS = [
  'aggregate',
  'world-rank',
  'clubs',
  'payments',
  'distinguished',
] as const
type RegionSortField = (typeof REGION_SORT_FIELDS)[number]

interface KpiCardProps {
  label: string
  base: number
  current: number
  /** Clubs qualifying today but not yet confirmed (#2580): when set, the
   *  value is drawn as the confirmed headline with "+N qualifying today". */
  provisional?: number | undefined
}

/** KPI card with a base → current → Δ → ±% rhythm. Negative deltas
 *  render in maroon. Percent is omitted when base is 0 (avoid /0; the
 *  Distinguished case in particular relies on this). */
const KpiCard: React.FC<KpiCardProps> = ({
  label,
  base,
  current,
  provisional,
}) => {
  const delta = current - base
  const percent = base === 0 ? null : ((current - base) / base) * 100
  const deltaTone = delta >= 0 ? 'text-green-700' : 'text-tm-true-maroon'
  return (
    <div className="districts-kpi-card" aria-label={`${label} KPI`}>
      <p className="districts-kpi-card__label">{label}</p>
      <div className="districts-kpi-card__value">
        {provisional !== undefined ? (
          <DistinguishedCount confirmed={current} provisional={provisional} />
        ) : (
          current.toLocaleString()
        )}
      </div>
      <p className="text-xs text-gray-500 tabular-nums mt-1">
        <span data-testid="kpi-base">Base {base.toLocaleString()}</span> ·{' '}
        <span data-testid="kpi-delta" className={`font-semibold ${deltaTone}`}>
          {signedDelta(delta)}
        </span>
        {percent !== null && (
          <>
            {' '}
            ·{' '}
            <span
              data-testid="kpi-percent"
              className={`font-semibold ${deltaTone}`}
            >
              {signedPercent(percent)}
            </span>
          </>
        )}
      </p>
    </div>
  )
}

/* Per-tier display label + chip style. Pre-Distinguished districts get
   an em-dash; achieved tiers get a colored chip matching the tier. */
type AchievedTier = Exclude<
  DistinguishedDistrictTier,
  'NotDistinguished' | 'Unknown'
>

const TIER_DISPLAY: Record<AchievedTier, { label: string; className: string }> =
  {
    Distinguished: {
      label: 'Distinguished',
      className: 'bg-tm-true-maroon text-white',
    },
    Select: {
      label: 'Select',
      className: 'bg-tm-cool-gray text-gray-900',
    },
    Presidents: {
      label: "President's",
      className: 'bg-tm-happy-yellow text-gray-900',
    },
    Smedley: {
      label: 'Smedley',
      className: 'bg-purple-200 text-purple-900',
    },
  }

/* Phone priority-column cells (#1834). Same tones and sign rules as the
   full table's KpiCard / SignedDeltaTd (lesson 102: a signed current − base,
   never a clamped gap). */
const ValueWithDelta: React.FC<{ value: number; delta: number }> = ({
  value,
  delta,
}) => (
  <>
    <span className="block">{value.toLocaleString()}</span>
    <span
      className={`block font-semibold ${
        delta >= 0 ? 'text-green-700' : 'text-tm-true-maroon'
      }`}
    >
      {signedDelta(delta)}
    </span>
  </>
)

/* A phone metric column is ~80px of content: "Distinguished" at 14px is
   ~95px and would clip (Lesson 134). The chip shows a short label; the full
   tier name rides along as the tooltip and the screen-reader text. */
const TIER_SHORT: Record<AchievedTier, { short: string; full: string }> = {
  Distinguished: { short: 'Dist.', full: 'Distinguished' },
  Select: { short: 'Select', full: 'Select Distinguished' },
  Presidents: { short: 'Pres.', full: "President's Distinguished" },
  Smedley: { short: 'Smedley', full: 'Smedley Distinguished' },
}

const TierLabel: React.FC<{
  tier: DistinguishedDistrictTier | null
  districtId: string
}> = ({ tier, districtId }) => {
  if (!tier || tier === 'NotDistinguished' || tier === 'Unknown')
    return (
      <span className="text-[var(--ink-3)]">
        <span aria-hidden="true">—</span>
        <span className="sr-only">No tier</span>
      </span>
    )
  const { short, full } = TIER_SHORT[tier]
  return (
    <span
      data-testid={`priority-tier-${districtId}`}
      className={`priority-columns__tier ${TIER_DISPLAY[tier].className}`}
      title={full}
    >
      <span aria-hidden="true">{short}</span>
      <span className="sr-only">{full}</span>
    </span>
  )
}

const RegionIdentity: React.FC<{
  districtId: string
  districtName: string
  rank: { rank: number; isTied: boolean }
  /** Membership series (#1815): the row's only chart at 375. */
  trend: number[] | null | undefined
}> = ({ districtId, districtName, rank, trend }) => (
  <Link to={`/district/${districtId}`} className="region-identity">
    <span className="font-semibold tabular-nums">
      #{rank.rank}
      {rank.isTied && <span className="sr-only"> (tied)</span>}
      {rank.isTied && <span aria-hidden="true">=</span>}
    </span>
    <DistrictChipAndName
      districtId={districtId}
      name={districtName}
      nameClassName="truncate text-sm font-medium"
    />
    {/* Own line under rank + chip: beside them it overflows the ~105px
        identity at 375 and is clipped (Lesson 134). */}
    <span className="region-identity__trend">
      <DistrictTrendSparkline series={trend} />
    </span>
  </Link>
)

const RegionPage: React.FC = () => {
  const { n } = useParams<{ n: string }>()
  const navigate = useNavigate()
  const region = normaliseRegionId(n) // "1" → "01", as rankings key it (#2130)
  useDocumentTitle(`Region ${region}`)

  // URL-synced click-header sort (#851). Default keeps the historical
  // behaviour — aggregate score, highest first.
  const { sort, toggleSort } = useUrlSort<RegionSortField>({
    fields: REGION_SORT_FIELDS,
    defaultField: 'aggregate',
    defaultDirection: 'desc',
  })

  // PY selector state (#1301) — the page owns program year/date (R3) and
  // threads the selected snapshot date into the rankings query so switching
  // the year re-queries (the awards query below follows via effectiveDate).
  const {
    selectedProgramYear,
    setSelectedProgramYear,
    selectedDate,
    setSelectedDate,
    availableProgramYears,
    cachedDates,
    effectiveDate,
    isLatestSnapshot,
    isDatesPending,
  } = useProgramYearControls()

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['district-rankings', effectiveDate ?? 'latest'],
    queryFn: async () => {
      if (effectiveDate) return fetchCdnRankingsForDate(effectiveDate)
      return fetchCdnRankings()
    },
    staleTime: 15 * 60 * 1000,
    placeholderData: prev => prev,
  })

  // Distinguished District prerequisite gaps. Pin to the rankings SNAPSHOT
  // date (effectiveDate), NOT data.asOfDate (the as-of sourceCsvDate). The
  // competitive-awards file is stored under the snapshot date; during
  // month-end reconciliation the sourceCsvDate advances past it, so keying on
  // the as-of date 404s and blanks the countdown/tier columns (#1315).
  const { data: awards, isPending: awardsPending } =
    useCompetitiveAwards(effectiveDate)

  // Membership is the SELECTED PY's own (#1821): the district → region
  // history for the year the controls name (R3), not whatever region the
  // rankings row carries. The row's region is the fallback when the history
  // is absent or has no entry for that district and year.
  const { history: regionHistory, isPending: historyPending } =
    useDistrictRegionHistory()
  const regionOf = React.useMemo(
    () => regionMembershipFor(regionHistory, selectedProgramYear.label),
    [regionHistory, selectedProgramYear.label]
  )

  // Membership sparkline per district (#1815): the page's own program year
  // and pinned date (R3). Keyed on the region's ids, not the sort order.
  const regionDistrictIds = React.useMemo(
    () =>
      (data?.rankings ?? [])
        .filter(r => regionOf(r) === region)
        .map(r => r.districtId)
        .sort(),
    [data, region, regionOf]
  )
  const trends = useDistrictTrends(
    regionDistrictIds,
    selectedProgramYear.label,
    effectiveDate
  )

  // "On track, based on last year's pace" (#2307): the reference year's
  // medians on the same day, for the page's own PY and date (R3).
  const pace = useRegionPace(selectedProgramYear.label, effectiveDate)

  // The pipeline's confirmed / qualifying-today pairs (#2553, #2580) for this
  // region and its districts, from the page's pinned date (R3). Absent until
  // the daily run publishes them: then no extra is shown.
  const { rollups } = useRegionRollups(effectiveDate)
  const regionCounts = regionDistinguishedCounts(rollups, region)
  const provisionalByDistrict = React.useMemo(
    () => districtProvisionalMap(rollups),
    [rollups]
  )

  // Phones (#2653): District Recognition opens collapsed to a one-line
  // summary, so the rankings table starts within two screens.
  const isPhone = useIsMobile(768)

  // District Recognition scoreboard (#2307): the PY-gated tier each
  // district meets in the awards file, per tier of the selected PY's ladder.
  const recognition = React.useMemo(
    () =>
      buildRecognitionScoreboard(
        (data?.rankings ?? [])
          .filter(r => regionOf(r) === region)
          .map(r => ({
            districtId: r.districtId,
            paidClubBase: r.paidClubBase ?? 0,
            paymentBase: r.paymentBase ?? 0,
            paidClubs: r.paidClubs ?? 0,
            totalPayments: r.totalPayments ?? 0,
            distinguishedClubs: r.distinguishedClubs ?? 0,
          })),
        awards?.distinguishedDistrict,
        selectedProgramYear.label,
        pace.medians
      ),
    [data, region, regionOf, awards, selectedProgramYear.label, pace.medians]
  )

  // Region ranks are ALWAYS computed from aggregate score, regardless of
  // the visible sort order — a district's regional rank is a property of
  // the district, not of how the table is currently arranged. We compute
  // the rank lookup once, then sort the rows for display per the URL.
  const scoreSortedDistricts: DistrictRanking[] =
    data?.rankings && region
      ? data.rankings
          .filter(r => regionOf(r) === region)
          .sort((a, b) => (b.aggregateScore ?? 0) - (a.aggregateScore ?? 0))
      : []

  const regionRanks = computeTiedRanks(
    scoreSortedDistricts,
    d => d.aggregateScore ?? 0
  )
  const rankByDistrictId = new Map(
    scoreSortedDistricts.map((d, i) => [d.districtId, regionRanks[i]!])
  )

  // Apply the URL-driven sort on top of the score-ordered base.
  const regionDistricts: DistrictRanking[] = (() => {
    if (scoreSortedDistricts.length === 0) return []
    const arr = [...scoreSortedDistricts]
    const dir = sort.direction === 'asc' ? 1 : -1
    switch (sort.field) {
      case 'clubs':
        return arr.sort(
          (a, b) => ((a.paidClubs ?? 0) - (b.paidClubs ?? 0)) * dir
        )
      case 'payments':
        return arr.sort(
          (a, b) => ((a.totalPayments ?? 0) - (b.totalPayments ?? 0)) * dir
        )
      case 'distinguished':
        return arr.sort(
          (a, b) =>
            ((a.distinguishedClubs ?? 0) - (b.distinguishedClubs ?? 0)) * dir
        )
      case 'world-rank':
        return arr.sort(
          (a, b) => ((a.overallRank ?? 0) - (b.overallRank ?? 0)) * dir
        )
      default:
        // aggregate score — base order is desc-by-score; flip if asc.
        return sort.direction === 'asc' ? arr.reverse() : arr
    }
  })()

  // One transition from the structural shell to the page (#2634): the
  // membership (region history), the awards and the pace decide the KPI
  // strip, the recognition cards and the rows, so the page is not drawn
  // until they have answered (a missing file answers too).
  if (
    isLoading ||
    (!error && (awardsPending || historyPending || pace.isPending))
  ) {
    return <RegionPageLoadingShell region={region} />
  }

  if (error || !data) {
    // #2636 — one error state with Try again; "browse all regions" stays as
    // the way out.
    return (
      <div className="app-shell__page">
        <ErrorDisplay
          error={error ?? 'Failed to fetch'}
          title="Could not load region"
          subject="this region"
          onRetry={() => {
            refetch()
          }}
        />
        <button
          type="button"
          className="tm-btn-secondary mt-3"
          onClick={() => navigate('/regions')}
        >
          View all regions
        </button>
      </div>
    )
  }

  // Sparse region: no districts map to this region number. Use the shared
  // card-based EmptyState with a real recovery CTA instead of a bare-prose
  // paragraph (#883, Epic F — kill CC-10 prose empty state). EmptyState
  // shares the loaded-state card geometry, so the empty/error/loaded
  // terminal states stay layout-consistent (lesson 125).
  if (regionDistricts.length === 0) {
    return (
      <EmptyState
        title={`No districts in Region ${region}`}
        message={`We don't have any districts on record for Region ${region}. Browse all regions to find the one you're looking for.`}
        icon="data"
        action={{
          label: 'View all regions',
          onClick: () => navigate('/regions'),
        }}
      />
    )
  }

  // KPI rollup for this region.
  const totals = regionDistricts.reduce(
    (acc, d) => {
      acc.paidClubs += d.paidClubs ?? 0
      acc.paidClubBase += d.paidClubBase ?? 0
      acc.totalPayments += d.totalPayments ?? 0
      acc.paymentBase += d.paymentBase ?? 0
      acc.distinguishedClubs += d.distinguishedClubs ?? 0
      return acc
    },
    {
      paidClubs: 0,
      paidClubBase: 0,
      totalPayments: 0,
      paymentBase: 0,
      distinguishedClubs: 0,
    }
  )

  // Phone priority columns (#1834): the metrics a visitor can pick 2 of.
  // Each reads the same fields as the full table's cells, so the two views
  // never disagree.
  const regionMetrics: PriorityMetric<DistrictRanking, RegionSortField>[] = [
    {
      id: 'score',
      label: 'Score',
      title: 'Aggregate ranking score',
      sortField: 'aggregate',
      render: d => d.aggregateScore,
    },
    {
      id: 'world',
      label: 'World',
      title: 'World rank',
      sortField: 'world-rank',
      render: d => `#${d.overallRank}`,
    },
    {
      id: 'clubs',
      label: 'Paid clubs',
      title: 'Paid clubs, with signed change vs base',
      sortField: 'clubs',
      render: d => (
        <ValueWithDelta
          value={d.paidClubs ?? 0}
          delta={
            awards?.distinguishedDistrict?.[d.districtId]?.netClubGrowth ??
            (d.paidClubs ?? 0) - (d.paidClubBase ?? 0)
          }
        />
      ),
    },
    {
      id: 'payments',
      label: 'Payments',
      title: 'Membership payments, with signed change vs base',
      sortField: 'payments',
      render: d => (
        <ValueWithDelta
          value={d.totalPayments ?? 0}
          delta={(d.totalPayments ?? 0) - (d.paymentBase ?? 0)}
        />
      ),
    },
    {
      id: 'distinguished',
      label: 'Dist. clubs',
      title: 'Distinguished clubs',
      sortField: 'distinguished',
      // Confirmed count, with "+N qualifying today" on its own line (#2580).
      render: d => (
        <DistinguishedCount
          confirmed={d.distinguishedClubs ?? 0}
          provisional={provisionalByDistrict.get(d.districtId)}
          stacked
        />
      ),
    },
    {
      id: 'tier',
      label: 'Tier',
      title: 'Current Distinguished District tier',
      render: d => (
        <TierLabel
          districtId={d.districtId}
          tier={
            awards?.distinguishedDistrict?.[d.districtId]?.currentTier ?? null
          }
        />
      ),
    },
  ]

  // The rankings table as rendered at >=768 and, with every column, inside the
  // phone's full-table sheet (#1834). #2702: the shared DataTable; which
  // columns show is a choice (one Columns menu), never CSS.
  const rankedDistricts: RegionRankedDistrict[] = regionDistricts.map(d => {
    const rank = rankByDistrictId.get(d.districtId)!
    return {
      ...d,
      regionRank: rank.rank,
      regionRankTied: rank.isTied,
      distinguishedProvisional: provisionalByDistrict.get(d.districtId),
    }
  })
  const rankingsTable = (variant: 'page' | 'sheet') => (
    <RegionDistrictRankingsTable
      variant={variant}
      region={region}
      rows={rankedDistricts}
      sort={sort}
      onSort={toggleSort as (field: string) => void}
      asOfDate={data?.asOfDate}
      awards={awards ?? null}
      trendOf={districtId => trends.get(districtId)}
    />
  )

  return (
    // #848 — data-grid surface (19-column rankings table); uses the wide
    // --page-max-wide cap, same policy as .districts-page /
    // .district-detail-page (ADR-006 §1). The empty-state branch above
    // stays on .app-shell__page since it's prose, not a data grid.
    <div className="districts-page">
      {/* Phone context bar (#1831): below 768 it replaces this header; PY and
          date are this page's own state (R3), set through the same setters. */}
      <ContextBar
        title={`Region ${region}`}
        back={{ label: 'Regions', to: '/regions' }}
        programYear={selectedProgramYear}
        date={effectiveDate}
        controls={
          <ContextSheetControls
            availableProgramYears={availableProgramYears}
            selectedProgramYear={selectedProgramYear}
            onProgramYearChange={setSelectedProgramYear}
            availableDates={cachedDates}
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
            freshness={formatFreshnessLine({
              asOfDate: data?.asOfDate,
              snapshotDate: effectiveDate,
              isLatest: isLatestSnapshot,
            })}
          />
        }
        about={`${regionDistricts.length} district${regionDistricts.length === 1 ? '' : 's'} in this region. Tap a district to drill into its clubs.`}
        trail={[
          { label: 'Regions', to: '/regions' },
          { label: `Region ${region}` },
        ]}
      />
      <header className="districts-page-header">
        <div className="districts-page-header__intro">
          <p className="districts-page-header__eyebrow">
            Toastmasters Region {region}
          </p>
          <h1 className="districts-page-header__title">Region {region}</h1>
          <p className="districts-page-header__lede">
            {regionDistricts.length} district
            {regionDistricts.length === 1 ? '' : 's'} in this region. Click a
            district to drill into its clubs.
          </p>
        </div>
        <div className="districts-page-header__actions">
          <DataControlsBar
            latestSnapshotDate={effectiveDate}
            asOfDate={data?.asOfDate}
            isLatest={isLatestSnapshot}
            availableProgramYears={availableProgramYears}
            selectedProgramYear={selectedProgramYear}
            onProgramYearChange={setSelectedProgramYear}
            availableDates={cachedDates}
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
            freshnessPending={isDatesPending}
          />
        </div>
      </header>

      <RegionSubnav
        base={`/region/${region}`}
        label={`Region ${region} sections`}
      />
      <div
        className="districts-kpi-strip districts-kpi-strip--two-up"
        style={{ marginBottom: 24 }}
        aria-label="Region totals"
      >
        <div className="districts-kpi-card" aria-label="Districts KPI">
          <p className="districts-kpi-card__label">Districts</p>
          <div className="districts-kpi-card__value">
            {regionDistricts.length}
          </div>
        </div>
        <KpiCard
          label="Paid Clubs"
          base={totals.paidClubBase}
          current={totals.paidClubs}
        />
        <KpiCard
          label="Payments"
          base={totals.paymentBase}
          current={totals.totalPayments}
        />
        {/* Distinguished is year-cumulative — every July 1 the count
            resets to zero. Treating base as 0 is semantically correct
            and makes Δ equal to the current count. */}
        <KpiCard
          label="Distinguished Clubs"
          base={0}
          current={regionCounts?.confirmed ?? totals.distinguishedClubs}
          provisional={regionCounts?.provisional ?? 0}
        />
      </div>
      {regionCounts && <DistinguishedBasisNote className="text-sm mb-3" />}

      <RegionRecognitionScoreboard
        scoreboard={recognition}
        programYear={selectedProgramYear.label}
        pace={pace.reference}
        collapsible={isPhone}
      />

      <PriorityColumnsTable<DistrictRanking, RegionSortField>
        label={`Region ${region} district rankings`}
        rows={regionDistricts}
        rowKey={d => d.districtId}
        identityHeader="District"
        identitySortField="aggregate"
        renderIdentity={d => (
          <RegionIdentity
            districtId={d.districtId}
            districtName={d.districtName}
            rank={rankByDistrictId.get(d.districtId)!}
            trend={trends.get(d.districtId)}
          />
        )}
        metrics={regionMetrics}
        defaultMetricIds={['clubs', 'payments']}
        sort={sort}
        onSort={toggleSort}
        fullTableTitle={`Region ${region} — all columns`}
        sheetTable={rankingsTable('sheet')}
        sheetRegionClassName="districts-rankings-table__sheet"
        fullTable={
          // >=768 only: below that, PriorityColumnsTable shows rank + district
          // + 2 chosen metrics and every column moves into its full-screen
          // sheet (#1834). A leaderboard keeps the table (its value is
          // comparing districts across rows); the width picks the default
          // columns, one Columns menu changes them, and the header sticks to
          // the page. The wrap must not clip (data-table.css R-1).
          <div className="districts-rankings-table-wrap districts-rankings-table-wrap--dt">
            {rankingsTable('page')}
          </div>
        }
      />
    </div>
  )
}

export default RegionPage
