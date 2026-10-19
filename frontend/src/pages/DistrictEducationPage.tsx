import React, { useMemo } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { useDistricts } from '../hooks/useDistricts'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useDistrictCachedDates } from '../hooks/useDistrictData'
import { useDistrictAnalytics } from '../hooks/useDistrictAnalytics'
import { useDistrictStatistics } from '../hooks/useMembershipData'
import { useUrlProgramYear } from '../hooks/useUrlProgramYear'
import {
  getAvailableProgramYears,
  filterDatesByProgramYear,
  getMostRecentDateInProgramYear,
  isDateInProgramYear,
} from '../utils/programYear'
import { buildDistrictEducation } from '../utils/districtEducation'
import { computeEducationAwardRankings } from '../utils/educationAwardRankings'
import { extractEducationLevels } from '../utils/extractEducationLevels'
import { DistrictDetailHeader } from '../components/DistrictDetailHeader'
import { SubpageBreadcrumb } from '../components/SubpageBreadcrumb'
import { DistrictSubnav } from '../components/DistrictSubnav'
import { DistrictEducationView } from '../components/DistrictEducationView'
import { EducationAwardsLeaderboard } from '../components/EducationAwardsLeaderboard'
import { EducationLevelsCard } from '../components/EducationLevelsCard'
import { LoadingSkeleton } from '../components/LoadingSkeleton'
import ErrorBoundary from '../components/ErrorBoundary'

/* District Education page (#1793, epic #1781) — `/district/:id/education`.
   The DD/PQD view of education awards this program year to date: totals,
   level × path, which divisions and areas produce them, and the two
   education-award leaderboards (moved here from Analytics). Ledger only:
   it reads the reports sidecar the analytics hook already fetches for the
   snapshot — no new pipeline artifact. Program year and date come from the
   shared URL-synced page controls and are passed down (R3); the dataset's
   own `programYear` is only checked against them, never used instead. */

const DistrictEducationPage: React.FC = () => {
  const { districtId } = useParams<{ districtId: string }>()

  const {
    selectedProgramYear,
    setSelectedProgramYear,
    selectedDate,
    setSelectedDate,
  } = useUrlProgramYear()

  const { data: districtsData } = useDistricts()
  const selectedDistrict = districtsData?.districts?.find(
    d => d.id === districtId
  )

  const { data: cachedDatesData } = useDistrictCachedDates(districtId || '')
  const allCachedDates = useMemo(
    () => cachedDatesData?.dates || [],
    [cachedDatesData?.dates]
  )
  const availableProgramYears = useMemo(
    () => getAvailableProgramYears(allCachedDates),
    [allCachedDates]
  )

  React.useEffect(() => {
    if (availableProgramYears.length > 0) {
      const has = availableProgramYears.some(
        py => py.year === selectedProgramYear.year
      )
      if (!has) {
        const mostRecent = availableProgramYears[0]
        if (mostRecent) setSelectedProgramYear(mostRecent)
      }
    }
  }, [availableProgramYears, selectedProgramYear.year, setSelectedProgramYear])

  const cachedDatesInProgramYear = useMemo(
    () => filterDatesByProgramYear(allCachedDates, selectedProgramYear),
    [allCachedDates, selectedProgramYear]
  )

  const effectiveProgramYear = useMemo(() => {
    if (availableProgramYears.length === 0) return null
    const has = availableProgramYears.some(
      py => py.year === selectedProgramYear.year
    )
    if (has) return selectedProgramYear
    return availableProgramYears[0] ?? null
  }, [availableProgramYears, selectedProgramYear])

  const effectiveEndDate = useMemo(() => {
    if (!effectiveProgramYear) return null
    if (
      selectedDate &&
      isDateInProgramYear(selectedDate, effectiveProgramYear)
    ) {
      return selectedDate
    }
    // null is unreachable here — see getMostRecentDateInProgramYear (#1323).
    return getMostRecentDateInProgramYear(allCachedDates, effectiveProgramYear)
  }, [selectedDate, effectiveProgramYear, allCachedDates])

  const hasValidDates =
    effectiveProgramYear !== null && effectiveEndDate !== null

  const { data: analytics, isLoading: analyticsLoading } = useDistrictAnalytics(
    hasValidDates ? districtId || null : null,
    effectiveProgramYear?.startDate,
    effectiveEndDate ?? undefined
  )

  const clubs = useMemo(
    () =>
      (analytics?.allClubs ?? []).map(club => ({
        clubId: club.clubId,
        clubName: club.clubName,
        divisionId: club.divisionId,
        areaId: club.areaId,
        membershipBase: club.membershipBase ?? 0,
      })),
    [analytics]
  )

  const education = useMemo(() => {
    if (!effectiveProgramYear || !analytics) return null
    return buildDistrictEducation({
      reports: analytics.districtReports ?? null,
      programYear: effectiveProgramYear.label,
      clubs,
    })
  }, [analytics, clubs, effectiveProgramYear])

  // Any-date fallback (#2159, kept from the retired Analytics page): when the
  // ledger is absent for this date, the club performance report's education
  // columns still give level totals. Fetched only then — a date with the
  // ledger never reads the raw snapshot.
  const ledgerAbsent = education !== null && education.status !== 'available'
  const { data: districtStatistics } = useDistrictStatistics(
    ledgerAbsent ? districtId || null : null,
    effectiveEndDate ?? undefined,
    'divisions'
  )
  const csvEducationLevels = useMemo(
    () =>
      ledgerAbsent && districtStatistics
        ? extractEducationLevels(districtStatistics)
        : null,
    [ledgerAbsent, districtStatistics]
  )

  // Education-award leaderboards (#1592) — per-club ratios over the July 1
  // membership base, from the same reports dataset.
  const rankings = useMemo(() => {
    if (!analytics) return null
    return computeEducationAwardRankings(
      clubs,
      analytics.districtReports ?? null
    )
  }, [analytics, clubs])

  // Prior vs current PY, from the page's own PY selection against the
  // district's newest PY with data (R3), never reports.programYear.
  const isPriorProgramYear =
    effectiveProgramYear !== null &&
    availableProgramYears[0] !== undefined &&
    effectiveProgramYear.year < availableProgramYears[0].year

  const rawName = selectedDistrict?.name || districtId || ''
  const districtName = /^\d+$/.test(rawName) ? `District ${rawName}` : rawName
  useDocumentTitle(districtName ? `${districtName} Education` : null)

  const availableDates = cachedDatesInProgramYear.sort((a, b) =>
    b.localeCompare(a)
  )

  const loading =
    !hasValidDates || analyticsLoading || !education || !effectiveEndDate

  // In-page anchors (`#leaderboards`, the Analytics redirect target) exist
  // only once the content renders, so scroll to them then.
  const { hash } = useLocation()
  React.useEffect(() => {
    if (loading || !hash) return
    document
      .getElementById(decodeURIComponent(hash.slice(1)))
      ?.scrollIntoView?.({ block: 'start' })
  }, [loading, hash])

  if (!districtId) {
    return null
  }

  return (
    <ErrorBoundary>
      <div className="district-detail-page-root">
        <div className="district-detail-page">
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

          <SubpageBreadcrumb
            crumbs={[{ label: districtName, to: `/district/${districtId}` }]}
          />

          <DistrictSubnav districtId={districtId} />

          {loading ? (
            <LoadingSkeleton variant="card" />
          ) : (
            <>
              <DistrictEducationView
                education={education}
                snapshotDate={effectiveEndDate}
                isPriorProgramYear={isPriorProgramYear}
              />
              {csvEducationLevels && csvEducationLevels.total > 0 && (
                <section
                  className="education-csv-fallback"
                  aria-label="Education levels from the club performance report"
                >
                  <p className="education-provenance">
                    From the club performance report for {effectiveEndDate}.
                    These are TI&apos;s DCP-credited counts, so they will not
                    match the education ledger exactly.
                  </p>
                  <EducationLevelsCard totals={csvEducationLevels} />
                </section>
              )}
              {rankings && (
                <section
                  id="leaderboards"
                  className="education-leaderboards"
                  aria-label="Education award leaderboards"
                >
                  <EducationAwardsLeaderboard
                    rankings={rankings}
                    districtId={districtId}
                    isPriorProgramYear={isPriorProgramYear}
                  />
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </ErrorBoundary>
  )
}

export default DistrictEducationPage
