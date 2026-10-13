import React, { useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useDistricts } from '../hooks/useDistricts'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useDistrictCachedDates } from '../hooks/useDistrictData'
import { useDistrictAnalytics } from '../hooks/useDistrictAnalytics'
import { useDistrictGrowthCounts } from '../hooks/useDistrictGrowthCounts'
import { useUrlProgramYear } from '../hooks/useUrlProgramYear'
import {
  getAvailableProgramYears,
  filterDatesByProgramYear,
  getMostRecentDateInProgramYear,
  isDateInProgramYear,
} from '../utils/programYear'
import { buildClubGrowthFunnel } from '../utils/clubGrowthFunnel'
import { DistrictDetailHeader } from '../components/DistrictDetailHeader'
import { SubpageBreadcrumb } from '../components/SubpageBreadcrumb'
import { DistrictSubnav } from '../components/DistrictSubnav'
import { ClubGrowthFunnelView } from '../components/ClubGrowthFunnelView'
import { LoadingSkeleton } from '../components/LoadingSkeleton'
import ErrorBoundary from '../components/ErrorBoundary'

/* District Club Growth page (#1794, epic #1781) — `/district/:id/growth`.
   The Club Growth Director's view: prospective clubs by stage and days in
   stage → clubs chartered this program year → coached clubs → suspended this
   program year. Reads only data already on the CDN: the reports sidecar
   (fetched with the analytics file) and the dated rankings file. Program year
   and date come from the shared URL-synced page controls (R3). */

const DistrictGrowthPage: React.FC = () => {
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
  const { counts, isLoading: countsLoading } = useDistrictGrowthCounts(
    districtId,
    effectiveEndDate ?? undefined
  )

  const funnel = useMemo(() => {
    if (!districtId || !effectiveProgramYear || !effectiveEndDate) return null
    return buildClubGrowthFunnel({
      districtId,
      reports: analytics?.districtReports ?? null,
      counts,
      programYear: effectiveProgramYear,
      asOfDate: effectiveEndDate,
    })
  }, [districtId, analytics, counts, effectiveProgramYear, effectiveEndDate])

  const rawName = selectedDistrict?.name || districtId || ''
  const districtName = /^\d+$/.test(rawName) ? `District ${rawName}` : rawName
  useDocumentTitle(districtName ? `${districtName} Club Growth` : null)

  const availableDates = cachedDatesInProgramYear.sort((a, b) =>
    b.localeCompare(a)
  )

  if (!districtId) {
    return null
  }

  const loading = !hasValidDates || analyticsLoading || countsLoading

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

          {loading || !funnel || !effectiveEndDate ? (
            <LoadingSkeleton variant="card" />
          ) : (
            <ClubGrowthFunnelView funnel={funnel} asOfDate={effectiveEndDate} />
          )}
        </div>
      </div>
    </ErrorBoundary>
  )
}

export default DistrictGrowthPage
