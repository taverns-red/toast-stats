import React, { useMemo } from 'react'
import {
  Link,
  Navigate,
  useParams,
  useNavigate,
  useSearchParams,
} from 'react-router-dom'
import { redirectLegacyDistrictTab } from '../utils/legacyTabRedirect'
import { useDistricts } from '../hooks/useDistricts'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { DistrictDetailHeader } from '../components/DistrictDetailHeader'
import { DistrictSubnav } from '../components/DistrictSubnav'
import { useDistrictAnalytics } from '../hooks/useDistrictAnalytics'
import { useAggregatedAnalytics } from '../hooks/useAggregatedAnalytics'
import { usePerformanceTargets } from '../hooks/usePerformanceTargets'
import { useDistrictCachedDates } from '../hooks/useDistrictData'
import { useDistrictRankHistoryYears } from '../hooks/useDistrictRankHistoryYears'
import { useUrlProgramYear } from '../hooks/useUrlProgramYear'
import { ProgramYearSelector } from '../components/ProgramYearSelector'
import {
  getAvailableProgramYears,
  filterDatesByProgramYear,
  getMostRecentDateInProgramYear,
  isDateInProgramYear,
} from '../utils/programYear'
import type { ProgramYear } from '../utils/programYear'
import { DistrictOverview } from '../components/DistrictOverview'
import { NotableDatesSection } from '../components/NotableDatesSection'
import { LongestServingClubsLeaderboard } from '../components/LongestServingClubsLeaderboard'
import { MobileDisclosure } from '../components/MobileDisclosure'
import { DistinguishedDistrictTrophyCase } from '../components/DistinguishedDistrictTrophyCase'
import { useCompetitiveAwards } from '../hooks/useCompetitiveAwards'
import { useDistrictRanking } from '../hooks/useDistrictRanking'

import {
  DistrictKpiStrip,
  type DistrictKpiStripData,
} from '../components/DistrictKpiStrip'

// Synthetic rankings used when performance-targets CDN data is missing
// and the inline analytics rollup is the only source. Stable module-level
// const so the kpiStripData memo stays referentially clean.
const NULL_RANKINGS = {
  worldRank: null,
  worldPercentile: null,
  regionRank: null,
  totalDistricts: 0,
  totalInRegion: 0,
  region: null,
}

import ErrorBoundary from '../components/ErrorBoundary'
import { ErrorDisplay, EmptyState } from '../components/ErrorDisplay'

import GlobalRankingsTab from '../components/GlobalRankingsTab'

const DistrictDetailPageInner: React.FC = () => {
  const { districtId } = useParams<{ districtId: string }>()
  const navigate = useNavigate()

  // #571 (IA Phase 3) retired the tab strip. The page is now a single
  // scrollable narrative; the Clubs / Divisions / Rankings subviews
  // each live at their own route and the legacy `?tab=` URLs redirect
  // there via the outer DistrictDetailPage wrapper.

  // Use URL-synced program year and date (#272)
  const {
    selectedProgramYear,
    setSelectedProgramYear,
    selectedDate,
    setSelectedDate,
    setProgramYearAndDate,
  } = useUrlProgramYear()

  // Fetch cached dates for date selector
  const { data: cachedDatesData } = useDistrictCachedDates(districtId || '')

  // Get all cached dates
  const allCachedDates = React.useMemo(
    () => cachedDatesData?.dates || [],
    [cachedDatesData?.dates]
  )

  // Get available program years from cached dates
  const availableProgramYears = React.useMemo(() => {
    return getAvailableProgramYears(allCachedDates)
  }, [allCachedDates])

  // #1436 — the degraded "limited data" view's year source.
  //
  // `availableProgramYears` above is already per-district (it reads
  // `district-snapshot-index.json`), which is precisely why it cannot feed the
  // degraded selector: the branch below requires `!selectedDistrict`, and a
  // district WITH an index entry self-heals to its newest data year via the
  // effect that follows (#1398) and never degrades. The branch is reachable
  // only when the index has no entry — `index[id] ?? []` empty — so a selector
  // fed from it would render with nothing in it.
  //
  // The district's rank history is where it does appear. Gated on the index
  // having RESOLVED empty, so the happy path issues no extra request.
  const needsRankHistoryYears = !!cachedDatesData && allCachedDates.length === 0
  const {
    programYears: rankHistoryProgramYears,
    isLoading: isLoadingRankHistoryYears,
  } = useDistrictRankHistoryYears(districtId, needsRankHistoryYears)

  // Auto-select a valid program year if current selection is not in available list
  React.useEffect(() => {
    if (availableProgramYears.length > 0) {
      const isCurrentYearAvailable = availableProgramYears.some(
        py => py.year === selectedProgramYear.year
      )
      if (!isCurrentYearAvailable) {
        // Select the most recent available program year
        const mostRecentYear = availableProgramYears[0]
        if (mostRecentYear) {
          setSelectedProgramYear(mostRecentYear)
        }
      }
    }
  }, [availableProgramYears, selectedProgramYear.year, setSelectedProgramYear])

  // Filter cached dates by selected program year
  const cachedDatesInProgramYear = React.useMemo(() => {
    return filterDatesByProgramYear(allCachedDates, selectedProgramYear)
  }, [allCachedDates, selectedProgramYear])

  // Compute effective program year - use selected if available, otherwise most recent available
  // This prevents API calls with invalid date ranges during the transition period
  const effectiveProgramYear = React.useMemo(() => {
    if (availableProgramYears.length === 0) {
      return null // No data yet, don't make API calls
    }
    const isCurrentYearAvailable = availableProgramYears.some(
      py => py.year === selectedProgramYear.year
    )
    if (isCurrentYearAvailable) {
      return selectedProgramYear
    }
    // Fall back to most recent available
    return availableProgramYears[0] ?? null
  }, [availableProgramYears, selectedProgramYear])

  // Compute effective end date - must be within the effective program year
  const effectiveEndDate = React.useMemo(() => {
    if (!effectiveProgramYear) return null
    if (
      selectedDate &&
      isDateInProgramYear(selectedDate, effectiveProgramYear)
    ) {
      return selectedDate
    }
    // Use the most recent date in the effective program year, or the program year end date
    const mostRecent = getMostRecentDateInProgramYear(
      allCachedDates,
      effectiveProgramYear
    )
    // null is unreachable here — effectiveProgramYear comes from
    // getAvailableProgramYears(allCachedDates). See getMostRecentDateInProgramYear
    // for why, and why a `|| endDate` fallback must not come back (#1323).
    return mostRecent
  }, [selectedDate, effectiveProgramYear, allCachedDates])

  // Fetch district info. Scoped to the snapshot this page is DISPLAYING: the
  // roster below is an existence gate (see the `!selectedDistrict` branch), and
  // the current year's roster does not contain the districts realigned away
  // since — so a past-year URL for one of them fell through to the limited
  // Global-Rankings page (#1398). Declared after `effectiveEndDate` because it
  // consumes it; the gate itself is far below.
  const { data: districtsData } = useDistricts(effectiveEndDate ?? undefined)
  const selectedDistrict = districtsData?.districts?.find(
    d => d.id === districtId
  )

  // Determine if we have valid dates for API calls
  const hasValidDates =
    effectiveProgramYear !== null && effectiveEndDate !== null

  // Reset selectedDate when it's outside the selected program year
  // This prevents invalid date ranges where startDate > endDate
  React.useEffect(() => {
    if (
      selectedDate &&
      !isDateInProgramYear(selectedDate, selectedProgramYear)
    ) {
      // Clear the date so the next effect can pick a valid one
      setSelectedDate(undefined)
    }
  }, [selectedDate, selectedProgramYear, setSelectedDate])

  // Auto-select most recent date in program year when program year changes
  React.useEffect(() => {
    if (cachedDatesInProgramYear.length > 0 && !selectedDate) {
      const mostRecent = getMostRecentDateInProgramYear(
        allCachedDates,
        selectedProgramYear
      )
      if (mostRecent) {
        setSelectedDate(mostRecent)
      }
    }
  }, [
    selectedProgramYear,
    cachedDatesInProgramYear,
    allCachedDates,
    selectedDate,
    setSelectedDate,
  ])

  // Fetch aggregated analytics for overview tab (summary, trends, yearOverYear)
  // CDN-only: fetches pre-computed analytics from Cloud CDN (#173)
  // Requirements: 5.1, 5.2
  const {
    data: aggregatedAnalytics,
    isLoading: isLoadingAggregated,
    error: aggregatedError,
    refetch: refetchAggregated,
  } = useAggregatedAnalytics(
    hasValidDates ? districtId || null : null,
    effectiveEndDate ?? undefined
  )

  // Fetch full analytics for the hub's overview surfaces (KPI strip, notable
  // dates, longest-serving leaderboard). The trend charts and Top-Growth /
  // Top-DCP / education-levels analytics moved to /trends and /analytics
  // (#680), so the hub no longer needs time-series, payments-trend, or
  // district-statistics data.
  const {
    data: analytics,
    isLoading: isLoadingAnalytics,
    error: analyticsError,
    refetch: refetchAnalytics,
  } = useDistrictAnalytics(
    hasValidDates ? districtId || null : null,
    effectiveProgramYear?.startDate,
    effectiveEndDate ?? undefined
  )

  // Fetch performance targets and rankings for overview cards (#183)
  const { data: performanceTargets } = usePerformanceTargets(
    hasValidDates ? districtId || null : null,
    effectiveEndDate ?? undefined
  )

  const rawName = selectedDistrict?.name || districtId || ''
  const districtName = /^\d+$/.test(rawName) ? `District ${rawName}` : rawName
  useDocumentTitle(districtName)

  // Get all clubs from analytics
  const allClubs = analytics?.allClubs || []

  // This uses pre-computed data for faster initial load
  // Requirements: 5.1, 5.2
  const overviewData = React.useMemo(() => {
    if (!aggregatedAnalytics) return null

    return {
      // Summary metrics from aggregated endpoint
      totalMembership: aggregatedAnalytics.summary.totalMembership,
      membershipChange: aggregatedAnalytics.summary.membershipChange,
      clubCounts: aggregatedAnalytics.summary.clubCounts,
      distinguishedClubs: aggregatedAnalytics.summary.distinguishedClubs,
      distinguishedProjection:
        aggregatedAnalytics.summary.distinguishedProjection,
      // Trend data from time-series index
      membershipTrend: aggregatedAnalytics.trends.membership,
      // Year-over-year comparison
      yearOverYear: aggregatedAnalytics.yearOverYear,
      // Metadata
      dataSource: aggregatedAnalytics.dataSource,
      computedAt: aggregatedAnalytics.computedAt,
    }
  }, [aggregatedAnalytics])

  // Fetch competitive awards / Distinguished District status (#332). This
  // query resolves separately from (and later than) the page-analytics query;
  // its loading flag reserves the trophy-case slot to avoid the late-insert
  // CLS shift (#1105 / Lesson 107).
  const { data: competitiveAwards, isLoading: isLoadingCompetitiveAwards } =
    useCompetitiveAwards(effectiveEndDate ?? undefined)
  const distinguishedDistrictStatus = React.useMemo(() => {
    if (!districtId || !competitiveAwards?.distinguishedDistrict) return null
    return competitiveAwards.distinguishedDistrict[districtId] ?? null
  }, [districtId, competitiveAwards])

  // Rankings row supplies the raw integer counts used to derive the
  // trophy-case tile integers when the canonical `*Remaining` fields
  // are absent or the target tier is above Distinguished (#840). Scoped to
  // `effectiveEndDate` like `useCompetitiveAwards` above — counting a past
  // year's `nextTierGap` down against the CURRENT year's paidClubs/payments
  // is the second half of #1396.
  const { ranking: districtRanking } = useDistrictRanking(
    districtId,
    effectiveEndDate ?? undefined
  )
  const distinguishedRankingInputs = React.useMemo(() => {
    if (!districtRanking) return null
    return {
      paidClubBase: districtRanking.paidClubBase,
      paymentBase: districtRanking.paymentBase,
      paidClubs: districtRanking.paidClubs,
      totalPayments: districtRanking.totalPayments,
      distinguishedClubs: districtRanking.distinguishedClubs,
    }
  }, [districtRanking])

  // Extract threshold + officer award results for this district (#333)
  const clubStrengthResult = React.useMemo(() => {
    if (!districtId || !competitiveAwards?.clubStrengthAward) return null
    return (
      competitiveAwards.clubStrengthAward.allDistricts.find(
        d => d.districtId === districtId
      ) ?? null
    )
  }, [districtId, competitiveAwards])

  const leadershipExcellenceResult = React.useMemo(() => {
    if (!districtId || !competitiveAwards?.leadershipExcellenceAward)
      return null
    return (
      competitiveAwards.leadershipExcellenceAward.allDistricts.find(
        d => d.districtId === districtId
      ) ?? null
    )
  }, [districtId, competitiveAwards])

  const officerAwardsResult = React.useMemo(() => {
    if (!districtId || !competitiveAwards?.officerAwards) return null
    return {
      educationTraining:
        competitiveAwards.officerAwards.educationTraining.find(
          d => d.districtId === districtId
        ) ?? null,
      clubGrowth:
        competitiveAwards.officerAwards.clubGrowth.find(
          d => d.districtId === districtId
        ) ?? null,
    }
  }, [districtId, competitiveAwards])

  // Determine if we have data for the overview tab
  // Use aggregated data if available, otherwise fall back to full analytics
  const hasOverviewData = overviewData !== null || analytics !== null

  // Loading state for overview tab - prefer aggregated, but show loading if both are loading
  const isLoadingOverview = isLoadingAggregated && isLoadingAnalytics

  // Error state for overview - only show error if both fail
  const overviewError =
    aggregatedError && analyticsError ? aggregatedError : null

  // Get available dates sorted in descending order (filtered by program year)
  const availableDates = cachedDatesInProgramYear.sort((a, b) =>
    b.localeCompare(a)
  )

  // Sticky KPI strip data (#572). Prefer the usePerformanceTargets CDN
  // hook; fall back to inline analytics so existing snapshots keep
  // working while the targets pipeline is catching up.
  const kpiStripData: DistrictKpiStripData | null = useMemo(() => {
    if (!analytics) return null
    const pt = performanceTargets ?? analytics.performanceTargets
    return {
      paidClubs: {
        current: pt?.paidClubs.current ?? analytics.allClubs.length,
        targets: pt?.paidClubs.targets ?? null,
        rankings: pt?.paidClubs.rankings ?? NULL_RANKINGS,
      },
      membershipPayments: {
        current: pt?.membershipPayments.current ?? analytics.totalMembership,
        targets: pt?.membershipPayments.targets ?? null,
        rankings: pt?.membershipPayments.rankings ?? NULL_RANKINGS,
      },
      distinguishedClubs: {
        current:
          pt?.distinguishedClubs.current ?? analytics.distinguishedClubs.total,
        targets: pt?.distinguishedClubs.targets ?? null,
        rankings: pt?.distinguishedClubs.rankings ?? NULL_RANKINGS,
      },
      // #681 — Net Member Change = net change in district membership since
      // the program-year base. Sourced from `membershipChange`
      // (currentPayments − paymentBase, AnalyticsComputer.ts:387), which is
      // derived from the dense rankings paymentBase — NOT `memberCountChange`,
      // which is a last−first snapshot diff and resolves to 0 on the frontend's
      // single-snapshot analytics file (#185). TI membership is payment-based,
      // so this payment-vs-base delta IS the net member change.
      netMemberChange: {
        current: analytics.membershipChange ?? 0,
      },
    }
  }, [analytics, performanceTargets])

  // ── Degraded "limited data" view: program-year controls (#1436) ────────────
  //
  // Snapshot years when the district has them, rank-history years when it does
  // not. Declared unconditionally, above the early return — these are hooks.

  const degradedDataYears =
    availableProgramYears.length > 0
      ? availableProgramYears
      : rankHistoryProgramYears

  // The selected year is offered alongside the data years even when it has
  // none: a <select> whose value is absent from its options renders blank, and
  // the user has to be able to see where they currently are. It is the ONLY
  // year added — everything else in the list is a year this district really
  // appears in.
  const degradedYearOptions = React.useMemo(() => {
    const hasSelected = degradedDataYears.some(
      py => py.year === selectedProgramYear.year
    )
    const merged = hasSelected
      ? degradedDataYears
      : [...degradedDataYears, selectedProgramYear]
    return [...merged].sort((a, b) => b.year - a.year)
  }, [degradedDataYears, selectedProgramYear])

  // The most recent year with data OTHER than the one being viewed — what the
  // banner names so the user is not left guessing which year to try.
  const degradedSuggestedYear = React.useMemo(
    () =>
      degradedDataYears.find(py => py.year !== selectedProgramYear.year) ??
      null,
    [degradedDataYears, selectedProgramYear]
  )

  // Move BOTH `?py=` and `?date=` in one navigation. `useUrlProgramYear` reads
  // them independently, so a `?date=` left over from the previous year would
  // leave the page self-inconsistent — the hazard `searchIndex.ts` documents.
  // A district with no snapshots has no in-year date to offer, so the date is
  // dropped rather than carried across.
  const handleDegradedProgramYearChange = React.useCallback(
    (py: ProgramYear) => {
      const dateInYear = getMostRecentDateInProgramYear(allCachedDates, py)
      setProgramYearAndDate(py, dateInYear ?? undefined)
    },
    [allCachedDates, setProgramYearAndDate]
  )

  // If districts data has loaded but this district isn't in the tracked list,
  // show a limited page with Global Rankings (available for all districts)
  // instead of blank data. Only 6 districts have detailed per-district analytics.
  //
  // `cachedDatesData` gates the gate (#1398): the roster is only authoritative
  // once we know WHICH snapshot to read it from. Until the per-district date
  // index lands, `effectiveEndDate` is null and `useDistricts` is still on the
  // undated current-year entry — the roster that omits past-year districts. And
  // it loses that race routinely: the index is 388KB against rankings.json's
  // 88KB, so without this the past-year district page would flash the "limited
  // data" fallback before the dated roster arrived.
  if (cachedDatesData && districtsData && !selectedDistrict && districtId) {
    return (
      <ErrorBoundary>
        <div className="district-detail-page-root">
          <div className="container mx-auto px-4 py-4 sm:py-8">
            <div className="mb-4 sm:mb-6">
              <button
                onClick={() => navigate('/')}
                className="flex items-center gap-2 text-tm-loyal-blue hover:text-tm-loyal-blue-80 font-tm-headline font-medium transition-colors mb-4"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
                Back to Rankings
              </button>
              <h1 className="text-2xl sm:text-3xl font-tm-headline font-bold text-tm-black">
                {districtName}
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                District Statistics & Performance Analytics
              </p>
            </div>

            {/* Limited data banner */}
            <div
              data-testid="limited-data-banner"
              className="bg-tm-happy-yellow bg-opacity-20 border border-tm-happy-yellow rounded-lg p-4 mb-6 flex items-start gap-3"
            >
              <svg
                className="w-5 h-5 text-tm-loyal-blue mt-0.5 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div>
                <p className="text-sm font-medium text-tm-black">
                  This district has limited data available.
                </p>
                {/* #1436 — "not tracked in THIS year" and "not tracked at all"
                    are different situations and must not read identically. The
                    first names a year that does have data, so the user is not
                    left guessing which year to try. */}
                {degradedSuggestedYear ? (
                  <p className="text-sm text-gray-600 mt-1">
                    Detailed analytics (clubs, divisions, trends) are not
                    tracked for this district in {selectedProgramYear.label}. It
                    does appear in {degradedSuggestedYear.label} — switch
                    program year below.
                  </p>
                ) : (
                  <p className="text-sm text-gray-600 mt-1">
                    Detailed analytics (clubs, divisions, trends) are not yet
                    tracked for this district. Global rankings are available
                    below.
                  </p>
                )}
              </div>
            </div>

            {/* #1436 — the way out. This branch returns before
                DistrictDetailHeader, which was the page's only year control, so
                a district viewable in another year was unreachable from its own
                page. Rendered only when there IS another year to reach — but
                the slot is reserved while the rank-history query is in flight,
                so the selector does not late-insert and push the rankings
                below it down (the Lesson 107 shape). */}
            {(isLoadingRankHistoryYears || degradedSuggestedYear) && (
              <div
                data-testid="degraded-program-year-selector"
                className="mb-6 max-w-xs"
              >
                <ProgramYearSelector
                  availableProgramYears={degradedYearOptions}
                  selectedProgramYear={selectedProgramYear}
                  onProgramYearChange={handleDegradedProgramYearChange}
                  isLoading={isLoadingRankHistoryYears}
                />
              </div>
            )}

            {/* Global Rankings tab for untracked districts */}
            <GlobalRankingsTab
              districtId={districtId}
              districtName={districtName}
              selectedProgramYear={selectedProgramYear}
            />
          </div>
        </div>
      </ErrorBoundary>
    )
  }

  return (
    <ErrorBoundary>
      <div className="district-detail-page-root">
        <div className="district-detail-page">
          {districtId && (
            <DistrictDetailHeader
              districtId={districtId}
              districtName={districtName}
              selectedProgramYear={selectedProgramYear}
              setSelectedProgramYear={setSelectedProgramYear}
              availableProgramYears={availableProgramYears}
              selectedDate={selectedDate}
              onDateChange={setSelectedDate}
              availableDates={availableDates}
              latestSnapshotDate={
                cachedDatesData?.dateRange?.endDate ?? availableDates[0]
              }
            />
          )}

          {/* Lateral section nav (#678, ADR-005 §3). Landing-opt-IN — renders
              on the hub and every flat sub-page (unlike the breadcrumb). */}
          {districtId && <DistrictSubnav districtId={districtId} />}

          {/* Global Error State */}
          {overviewError && (
            <ErrorDisplay
              error={overviewError}
              title="Failed to Load District Data"
              onRetry={() => {
                refetchAggregated()
                refetchAnalytics()
              }}
              showDetails={true}
            />
          )}

          {/* No Data Prompt */}
          {!isLoadingOverview &&
            !overviewError &&
            !hasOverviewData &&
            districtId && (
              <EmptyState
                title="No District Data Available"
                message="This district doesn't have any cached historical data yet. Data will be available after the next pipeline run."
                icon="data"
                action={{
                  label: 'Back to Rankings',
                  onClick: () => {
                    navigate('/')
                  },
                }}
              />
            )}

          {/* Sticky KPI strip (#572). Sits above the narrative so the
              4 numbers stay pinned as the user scrolls; mobile gets a
              collapse chevron. */}
          {districtId && hasOverviewData && (
            <DistrictKpiStrip kpis={kpiStripData} />
          )}

          {/* Narrative content. #571 retired the tab strip; #679 (ADR-005)
              trimmed the hub to a lean Overview — the inline Divisions and
              "Vs world" duplicates and the "On this page" anchor rail were
              removed (DistrictSubnav owns wayfinding at every width). The
              remaining sections scroll as one story, with CTAs at the bottom
              that link out to the dedicated routes. */}
          <div className="space-y-4 sm:space-y-6">
            {districtId && hasOverviewData && (
              <section aria-label="District overview">
                {/* District Overview - Now uses global date selector */}
                {hasValidDates && effectiveProgramYear && (
                  <DistrictOverview
                    districtId={districtId}
                    /* Unconditional: `hasValidDates` above already means
                       `effectiveEndDate !== null`, and the old conditional
                       spread left an undated path open — the one that showed
                       the wrong year's payments (#1396). */
                    selectedDate={effectiveEndDate ?? undefined}
                    programYearStartDate={effectiveProgramYear.startDate}
                    performanceTargets={performanceTargets ?? undefined}
                  />
                )}

                {/* Distinguished District Trophy Case (#332).
                    programYear is REQUIRED (#1354). `effectiveProgramYear` is
                    null only before any PY data has resolved, and in that
                    state the panel has no status to render anyway; falling
                    back to the URL-synced selection keeps the checklist honest
                    about the year being DISPLAYED rather than reverting to the
                    legacy five-gate shape by omission. */}
                <DistinguishedDistrictTrophyCase
                  status={distinguishedDistrictStatus}
                  isLoading={isLoadingCompetitiveAwards}
                  programYear={
                    (effectiveProgramYear ?? selectedProgramYear).label
                  }
                  ranking={distinguishedRankingInputs}
                  clubStrengthQualifies={clubStrengthResult?.qualifies}
                  clubStrengthGrowth={clubStrengthResult?.growthPercent}
                  leadershipExcellenceQualifies={
                    leadershipExcellenceResult?.qualifies
                  }
                  leadershipExcellenceYears={
                    leadershipExcellenceResult?.consecutiveYears
                  }
                  educationTrainingQualifies={
                    officerAwardsResult?.educationTraining?.qualifies
                  }
                  clubGrowthQualifies={
                    officerAwardsResult?.clubGrowth?.qualifies
                  }
                />

                {/* Notable dates (#551) */}
                <NotableDatesSection
                  clubs={allClubs}
                  {...(districtId !== undefined && { districtId })}
                  {...(effectiveProgramYear?.year !== undefined && {
                    programYearStart: effectiveProgramYear.year,
                  })}
                />

                {/* Longest-serving clubs — secondary detail, folded behind a
                    disclosure below 768 px (audit §Epic B, #867). On desktop
                    MobileDisclosure renders the leaderboard directly. */}
                <MobileDisclosure
                  summaryLabel="Longest-serving clubs"
                  urlParam="clubsExpanded"
                >
                  <LongestServingClubsLeaderboard
                    clubs={allClubs}
                    {...(districtId !== undefined && { districtId })}
                  />
                </MobileDisclosure>
              </section>
            )}

            {/* #680 (ADR-005 §1): the membership/payment trend charts and the
                Top-Growth / Top-DCP / education-levels analytics moved off the
                lean hub onto /trends and /analytics. The DistrictSubnav above
                and the CTAs below are the entry points. */}

            {/* Subview CTAs — replace the retired tab strip. The inline
                Trends/Analytics/Divisions/Vs-world content moved to its own
                routes (#679, #680, ADR-005); these CTAs are a secondary path
                alongside the subnav. */}
            {districtId && (
              <nav
                aria-label="District subviews"
                className="flex flex-wrap gap-2 pt-2"
              >
                <Link
                  to={`/district/${districtId}/clubs`}
                  className="inline-flex items-center px-4 py-2 min-h-[44px] rounded-md bg-tm-loyal-blue text-white font-tm-headline font-medium hover:bg-tm-loyal-blue-80"
                >
                  View all clubs →
                </Link>
                <Link
                  to={`/district/${districtId}/divisions`}
                  className="inline-flex items-center px-4 py-2 min-h-[44px] rounded-md border border-tm-loyal-blue text-tm-loyal-blue font-tm-headline font-medium hover:bg-tm-loyal-blue-10"
                >
                  Divisions &amp; areas →
                </Link>
                <Link
                  to={`/district/${districtId}/trends`}
                  className="inline-flex items-center px-4 py-2 min-h-[44px] rounded-md border border-tm-loyal-blue text-tm-loyal-blue font-tm-headline font-medium hover:bg-tm-loyal-blue-10"
                >
                  Membership &amp; payment trends →
                </Link>
                <Link
                  to={`/district/${districtId}/analytics`}
                  className="inline-flex items-center px-4 py-2 min-h-[44px] rounded-md border border-tm-loyal-blue text-tm-loyal-blue font-tm-headline font-medium hover:bg-tm-loyal-blue-10"
                >
                  Top clubs &amp; analytics →
                </Link>
                <Link
                  to={`/district/${districtId}/rankings`}
                  className="inline-flex items-center px-4 py-2 min-h-[44px] rounded-md border border-tm-loyal-blue text-tm-loyal-blue font-tm-headline font-medium hover:bg-tm-loyal-blue-10"
                >
                  Global rankings →
                </Link>
              </nav>
            )}
          </div>
        </div>
      </div>
    </ErrorBoundary>
  )
}

/**
 * Default export: thin wrapper that intercepts the legacy `?tab=…` URLs
 * (clubs / divisions / globalRankings) and redirects to their new routes
 * BEFORE the heavy DistrictDetailPageInner hooks run. Without this
 * guard, inner effects (date selection, etc.) would race against
 * `<Navigate>` and clobber the new URL's search params after the route
 * transition.
 */
const DistrictDetailPage: React.FC = () => {
  const { districtId } = useParams<{ districtId: string }>()
  const [searchParams] = useSearchParams()
  const legacyTarget = redirectLegacyDistrictTab(
    `http://localhost/district/${districtId ?? ''}?${searchParams.toString()}`,
    districtId
  )
  if (legacyTarget) {
    const [pathname, search = ''] = legacyTarget.split('?') as [string, string?]
    return (
      <Navigate to={{ pathname, search: search ? `?${search}` : '' }} replace />
    )
  }
  return <DistrictDetailPageInner />
}

export default DistrictDetailPage
