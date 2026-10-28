/* DivisionPage (#424) — landing for a single division within a district.
   Shows the same division + areas recognition data as the Divisions overview
   (status, Gap-to-D/S/P, per-area visit metrics) via the shared
   extractDivisionPerformance + DivisionPerformanceCard (#1015), then lists
   every club in the division by area with health status. Reuses the shared
   district analytics + snapshot React-Query caches. */

import React from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useDistrictAnalytics } from '../hooks/useDistrictAnalytics'
import { useDistrictStatistics } from '../hooks/useMembershipData'
import { extractDivisionPerformance } from '../utils/extractDivisionPerformance'
import { calculateDivisionGapAnalysis } from '../utils/divisionGapAnalysis'
import { generateDivisionProgressText } from '../utils/divisionProgressText'
import { DivisionPerformanceCard } from '../components/DivisionPerformanceCard'
import { NextDeadlineStrip } from '../components/NextDeadlineStrip'
import { ContextBar } from '../components/ContextBar'
import { ContextSheetControls } from '../components/ContextSheetControls'
import { formatFreshnessLine } from '../utils/contextBar'
import { SubpageBreadcrumb } from '../components/SubpageBreadcrumb'
import { LoadingSkeleton } from '../components/LoadingSkeleton'
import { isDistrictSlotPending } from '../utils/districtSlotPending'
import { EmptyState } from '../components/ErrorDisplay'
import { ClubMiniList } from '../components/ClubMiniList'
import { useIsMobile } from '../hooks/useIsMobile'
import { useDistrictProgramYearControls } from '../hooks/useDistrictProgramYearControls'
import { useGlobalFreshness } from '../hooks/useLatestAsOfDate'
import { DataControlsBar } from '../components/DataControlsBar'
import { OfficerTrainingSummary } from '../components/training/OfficerTrainingSummary'

const DivisionPage: React.FC = () => {
  const { districtId, divId } = useParams<{
    districtId: string
    divId: string
  }>()
  const navigate = useNavigate()
  const { search } = useLocation()
  const isMobile = useIsMobile()

  // PY selector state (#1302) — the page owns program year/date (R3) and threads
  // the selected PY's effective end date into its own queries so switching the
  // year re-queries. Was hardcoded to "latest snapshot only" (undefined dates).
  const {
    selectedProgramYear,
    setSelectedProgramYear,
    selectedDate,
    setSelectedDate,
    availableProgramYears,
    availableDates,
    effectiveProgramYear,
    effectiveEndDate,
    hasValidDates,
    isDatesPending,
    latestSnapshotDate,
    isLatestSnapshot,
  } = useDistrictProgramYearControls(districtId)

  // Freshness parity (#1321): the per-district snapshot carries no as-of date —
  // the old `snapshot.asOfDate` was a phantom, so this pill was permanently
  // blank. The shared hook owns the "is this really the latest?" rule.
  const { asOfDate: globalAsOfDate, isLatest: isLatestGlobal } =
    useGlobalFreshness({
      districtLatestSnapshotDate: latestSnapshotDate,
      isLatestSnapshot,
    })

  const { data, error } = useDistrictAnalytics(
    hasValidDates ? (districtId ?? null) : null,
    undefined,
    effectiveEndDate ?? undefined
  )

  // Recognition / gap / visit data come from the same raw snapshot the
  // Divisions overview reads — one source of truth (R6/R8, #1015). We reuse the
  // overview's extractDivisionPerformance util + DivisionPerformanceCard rather
  // than re-deriving from allClubs, so this scoped page can't drift from it.
  const { data: snapshot, isLoading: isLoadingSnapshot } =
    useDistrictStatistics(
      hasValidDates ? (districtId ?? null) : null,
      effectiveEndDate ?? undefined,
      'divisions'
    )
  const normalizedDivId = divId?.toUpperCase()
  // Visit rounds/deadlines gate on the date this page PINNED its snapshot query
  // to (#1321) — never the wall clock. `effectiveEndDate` is the same value fed
  // to useDistrictStatistics above, so the extraction can't disagree with the
  // data it describes. It is non-null whenever `snapshot` exists (the query is
  // disabled unless `hasValidDates`), but guard rather than assert.
  const divisionPerformance = React.useMemo(() => {
    if (!snapshot || !normalizedDivId || !effectiveEndDate) return undefined
    return extractDivisionPerformance(snapshot, effectiveEndDate).find(
      d => d.divisionId.toUpperCase() === normalizedDivId
    )
  }, [snapshot, normalizedDivId, effectiveEndDate])

  // Scoped division-level narrative — the same prose the overview's Division and
  // Area Progress Summary shows, scoped to this division (#1016 S2 refactor).
  // Reuses the existing generateDivisionProgressText generator (R6/R7).
  const divisionNarrative = React.useMemo(() => {
    if (!divisionPerformance) return undefined
    const gapAnalysis = calculateDivisionGapAnalysis({
      clubBase: divisionPerformance.clubBase,
      paidClubs: divisionPerformance.paidClubs,
      distinguishedClubs: divisionPerformance.distinguishedClubs,
    })
    return generateDivisionProgressText(divisionPerformance, gapAnalysis)
  }, [divisionPerformance])

  // #1896: loading keeps the page (context bar, header, data slots) inside the
  // root that reserves the area under the top bar, as the #1837 subpages do.
  // The bare card skeleton this replaced was short enough at 1280px to put
  // the shell footer on screen, and the landed page pushed it off (0.059).
  // Pending spans the date-index window too: the analytics query is disabled
  // there and reports isLoading false with no data, which flashed the
  // error state below.
  const isPending = isDistrictSlotPending(
    { hasData: !!data, isError: !!error },
    { hasValidDates, datesSettled: !isDatesPending }
  )
  // The recognition slot reads a second query (the snapshot) that resolves on
  // its own. Hold every data slot's skeleton until BOTH reads settle: swapping
  // one skeleton for the taller loaded card while the clubs skeleton still sat
  // below it pushed that skeleton off-screen (0.25 at 375 on the preview).
  // The date-index window is already inside `isPending`; once the dates
  // resolve, the snapshot query is enabled and reports `isLoading` itself.
  const isBodyPending = isPending || isLoadingSnapshot

  if (!isPending && (error || !data)) {
    return (
      <EmptyState
        title="Could not load division"
        message="The district analytics file is unavailable. Try again in a moment."
        icon="data"
      />
    )
  }

  // Slug validation (#1017): once the snapshot has LOADED, a division id absent
  // from its division list is a bad URL, not a real-but-empty division. Throw a
  // 404 so the root errorElement (#1011/#1012) renders the branded not-found
  // page with district-subpage recovery, instead of a misleading empty page.
  // Gate strictly on `snapshot` being present — never 404 while it's still
  // loading or errored (data-unavailable ≠ not-found), and never 404 a real
  // division whose clubs are all suspended (Lesson 147): the snapshot's division
  // list is the source of truth, the same one the recognition card reads.
  if (snapshot && !divisionPerformance) {
    throw new Response(null, { status: 404, statusText: 'Division not found' })
  }

  const clubs = (data?.allClubs ?? []).filter(
    c => c.divisionId.toUpperCase() === normalizedDivId
  )

  const divisionName = clubs[0]?.divisionName ?? `Division ${divId}`

  // Group clubs by area for the table sections.
  const areaGroups = new Map<
    string,
    { areaId: string; areaName: string; clubs: typeof clubs }
  >()
  for (const c of clubs) {
    const existing = areaGroups.get(c.areaId)
    if (existing) {
      existing.clubs.push(c)
    } else {
      areaGroups.set(c.areaId, {
        areaId: c.areaId,
        areaName: c.areaName,
        clubs: [c],
      })
    }
  }
  const areas = Array.from(areaGroups.values()).sort((a, b) =>
    a.areaId.localeCompare(b.areaId)
  )

  const lede =
    clubs.length === 0
      ? 'Division recognition standing for this program year.'
      : `${clubs.length} club${clubs.length === 1 ? '' : 's'} across ${areas.length} area${areas.length === 1 ? '' : 's'} in this division.`
  const viewedDate = effectiveEndDate ?? latestSnapshotDate
  const deadlineStrip = (
    <NextDeadlineStrip
      programYear={(effectiveProgramYear ?? selectedProgramYear).label}
      asOfDate={viewedDate}
    />
  )
  const districtUrl = `/district/${districtId}`

  return (
    <div className="app-shell__page district-detail-page-root">
      {/* Phone context bar (#1831): below 768 it replaces the breadcrumb and
          the header below; PY/date are this page's own state (R3). */}
      <ContextBar
        title={divisionName}
        back={{ label: `District ${districtId}`, to: districtUrl }}
        programYear={effectiveProgramYear ?? selectedProgramYear}
        date={viewedDate}
        controls={
          <ContextSheetControls
            availableProgramYears={availableProgramYears}
            selectedProgramYear={effectiveProgramYear ?? selectedProgramYear}
            onProgramYearChange={setSelectedProgramYear}
            availableDates={availableDates}
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
            freshness={formatFreshnessLine({
              asOfDate: globalAsOfDate,
              snapshotDate: viewedDate,
              isLatest: isLatestGlobal,
            })}
          />
        }
        about={lede}
        trail={[
          { label: 'Districts', to: '/' },
          { label: `District ${districtId}`, to: districtUrl },
          { label: divisionName },
        ]}
      />
      {/* District › Division wayfinding via the shared SubpageBreadcrumb every
          routed sub-page uses (Lesson 085) — replaces the ad-hoc eyebrow link so
          the trail, link affordance, and aria-current are consistent (#1017). */}
      <SubpageBreadcrumb
        crumbs={[
          { label: `District ${districtId}`, to: `/district/${districtId}` },
          { label: divisionName },
        ]}
      />
      <header className="districts-page-header">
        <div className="districts-page-header__intro">
          <h1 className="districts-page-header__title">{divisionName}</h1>
          <p className="districts-page-header__lede">{lede}</p>
        </div>
        <div className="districts-page-header__actions">
          <DataControlsBar
            latestSnapshotDate={effectiveEndDate ?? latestSnapshotDate}
            asOfDate={globalAsOfDate}
            isLatest={isLatestGlobal}
            availableProgramYears={availableProgramYears}
            // Derived (healed) year so the chip value is always in its option
            // list — avoids a transient controlled-select mismatch for an
            // out-of-range ?py= before the self-heal effect fires.
            selectedProgramYear={effectiveProgramYear ?? selectedProgramYear}
            onProgramYearChange={setSelectedProgramYear}
            availableDates={availableDates}
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
          />
        </div>
      </header>

      {/* Next-deadline strip (#2298): the page's own PY and date (R3).
          Desktop and tablet: under the header. Phone: after the first
          content block, which the 375 gate budgets to start by 110px. */}
      {!isMobile && deadlineStrip}

      {/* Division + areas recognition data, reused from the Divisions overview
          (#1015). Replaces the old ad-hoc allClubs KPI strip so the standalone
          page shows the same status / Gap-to-D-S-P / per-area visit metrics on
          the same computation as the overview. */}
      <div style={{ marginBottom: 24 }}>
        {isBodyPending ? (
          <LoadingSkeleton variant="table" count={3} />
        ) : (
          divisionPerformance && (
            <DivisionPerformanceCard division={divisionPerformance} />
          )
        )}
      </div>

      {/* Phone: mounted with the card, not under its skeleton — the card
          is taller than the skeleton and would push the strip down (CLS). */}
      {isMobile && !isBodyPending && deadlineStrip}

      {/* Council print pack (#2299): the division's summary as a printable
          document, carrying this page's ?py= / ?date= (R3). */}
      {!isBodyPending && (
        <p className="council-pack-link">
          <Link to={`/district/${districtId}/division/${divId}/print${search}`}>
            Print pack
          </Link>
          <span className="council-pack-link__hint">
            {' '}
            — Two pages: a summary of the division and its areas, then every
            club.
          </span>
        </p>
      )}

      {/* Scoped division-level narrative (#1016 S2) — same prose as the overview
          summary, scoped to this division. */}
      {!isBodyPending && divisionNarrative && (
        <article
          className="bg-tm-loyal-blue/10 rounded-lg p-4 border border-tm-loyal-blue/30"
          style={{ marginBottom: 24 }}
          aria-label="Division progress summary"
        >
          <p
            data-testid="division-progress-text"
            className="text-gray-800 font-tm-body leading-relaxed font-medium"
            style={{ fontSize: '15px' }}
          >
            {divisionNarrative.progressText}
          </p>
        </article>
      )}

      {/* Officer training (#2296): this scope's DCP goal 9 count per round,
          from the same snapshot, linking to the pre-filtered Training page. */}
      {!isBodyPending &&
        snapshot &&
        effectiveEndDate &&
        effectiveProgramYear &&
        districtId &&
        divId && (
          <OfficerTrainingSummary
            districtId={districtId}
            snapshot={snapshot}
            snapshotDate={effectiveEndDate}
            programYear={effectiveProgramYear.label}
            division={divId}
          />
        )}

      {/* No analytics-club rows for this division (suspended/migrated clubs).
          The recognition card above still renders from the snapshot — don't
          hide it behind an empty club list (#1015). */}
      {/* The division's clubs, reserved until both reads settle. */}
      {isBodyPending && <LoadingSkeleton variant="table" count={4} />}

      {!isBodyPending && clubs.length === 0 && (
        <p className="placeholder-page__body">
          No clubs are currently listed in this division.{' '}
          <Link to={`/district/${districtId}`}>
            Back to District {districtId}
          </Link>
          .
        </p>
      )}

      {!isBodyPending &&
        areas.map(area => (
          <section key={area.areaId} style={{ marginBottom: 32 }}>
            <h2
              data-testid="division-area-heading"
              style={{
                fontFamily: 'var(--serif)',
                fontSize: 18,
                fontWeight: 700,
                margin: '0 0 12px',
              }}
            >
              <Link
                to={`/district/${districtId}/division/${divId}/area/${area.areaId}`}
              >
                Area {area.areaId} — {area.areaName}
              </Link>
              <span
                style={{
                  fontFamily: 'var(--sans)',
                  fontSize: 13,
                  fontWeight: 400,
                  color: 'var(--ink-3)',
                  marginLeft: 8,
                }}
              >
                {area.clubs.length} club{area.clubs.length === 1 ? '' : 's'}
              </span>
            </h2>

            {/* CC-4 (#871): the 4-col table overflows 375px and clips the
              Status chip, so mobile de-tables to a stacked card list; desktop
              keeps the table unchanged. */}
            {isMobile ? (
              <ClubMiniList
                clubs={area.clubs}
                clubTo={c => `/district/${districtId}/club/${c.clubId}`}
              />
            ) : (
              <div className="districts-rankings-table-wrap">
                <div className="overflow-x-auto">
                  <table className="districts-rankings-table">
                    <thead>
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Club
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Members
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Distinguished
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {area.clubs.map(c => {
                        const last =
                          c.membershipTrend[c.membershipTrend.length - 1]
                        return (
                          <tr
                            key={c.clubId}
                            className="cursor-pointer"
                            onClick={() =>
                              navigate(
                                `/district/${districtId}/club/${c.clubId}`
                              )
                            }
                          >
                            <td className="px-6 py-4 whitespace-nowrap">
                              {/* CC-7 (#872): a real <Link> on the club name —
                                middle-click / open-in-new-tab work; whole-row
                                click stays as a mouse convenience (stop the
                                bubble so a name-click navigates once). */}
                              <Link
                                to={`/district/${districtId}/club/${c.clubId}`}
                                onClick={e => e.stopPropagation()}
                                className="clubs-name-link text-sm font-medium text-gray-900"
                              >
                                {c.clubName}
                              </Link>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                              {c.currentStatus}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900 tabular-nums">
                              {last?.count ?? '—'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {c.distinguishedLevel === 'NotDistinguished'
                                ? '—'
                                : c.distinguishedLevel}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        ))}
    </div>
  )
}

export default DivisionPage
