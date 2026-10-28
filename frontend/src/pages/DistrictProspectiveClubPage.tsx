import React, { useMemo } from 'react'
import { normalizeClubId } from '@taverns-red/shared-contracts'
import { useParams, useSearchParams } from 'react-router-dom'
import { useDistricts } from '../hooks/useDistricts'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useDistrictCachedDates } from '../hooks/useDistrictData'
import { useDistrictAnalytics } from '../hooks/useDistrictAnalytics'
import { useUrlProgramYear } from '../hooks/useUrlProgramYear'
import {
  getAvailableProgramYears,
  filterDatesByProgramYear,
  getMostRecentDateInProgramYear,
  isDateInProgramYear,
} from '../utils/programYear'
import { buildProspectiveClubPage } from '../utils/prospectiveClubPage'
import { DistrictDetailHeader } from '../components/DistrictDetailHeader'
import { SubpageBreadcrumb } from '../components/SubpageBreadcrumb'
import { DistrictSubnav } from '../components/DistrictSubnav'
import { ProspectiveClubView } from '../components/ProspectiveClubView'
import { LoadingSkeleton } from '../components/LoadingSkeleton'
import ErrorBoundary from '../components/ErrorBoundary'

/* District prospective club page (#2303) —
   `/district/:id/growth/prospective/:clubId`, under Club Growth (Growth stays
   current in the section nav; the breadcrumb and a back link lead to the
   funnel's prospective list). The Club Growth funnel's prospective rows link
   here. Reads only what the Growth page already reads for the same date —
   the analytics file (Find-a-Club place) with its reports sidecar (TI's
   Prospective Clubs report) — so the query is shared. Program year and date
   come from the shared URL-synced page controls (R3). */

const DistrictProspectiveClubPage: React.FC = () => {
  const { districtId, clubId } = useParams<{
    districtId: string
    clubId: string
  }>()

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
    return getMostRecentDateInProgramYear(allCachedDates, effectiveProgramYear)
  }, [selectedDate, effectiveProgramYear, allCachedDates])

  const hasValidDates =
    effectiveProgramYear !== null && effectiveEndDate !== null

  const { data: analytics, isLoading } = useDistrictAnalytics(
    hasValidDates ? districtId || null : null,
    effectiveProgramYear?.startDate,
    effectiveEndDate ?? undefined
  )

  const model = useMemo(() => {
    if (!districtId || !clubId || !effectiveEndDate || !analytics) return null
    return buildProspectiveClubPage({
      districtId,
      clubId,
      reports: analytics.districtReports ?? null,
      findAClub: analytics.prospectiveClubs,
      clubPageIds: new Set(
        (analytics.allClubs ?? []).map(c => normalizeClubId(c.clubId))
      ),
      asOfDate: effectiveEndDate,
    })
  }, [districtId, clubId, effectiveEndDate, analytics])

  // The Growth links keep the page's PY and date (R3: read from the URL).
  const [params] = useSearchParams()
  const growthQuery = useMemo(() => {
    const kept = new URLSearchParams()
    for (const key of ['py', 'date']) {
      const value = params.get(key)
      if (value) kept.set(key, value)
    }
    const qs = kept.toString()
    return qs ? `?${qs}` : ''
  }, [params])

  const rawName = selectedDistrict?.name || districtId || ''
  const districtName = /^\d+$/.test(rawName) ? `District ${rawName}` : rawName
  const clubName = model?.kind === 'found' ? model.clubName : null
  useDocumentTitle(
    districtName && model
      ? `${clubName ?? 'Prospective club'} · ${districtName}`
      : null
  )

  const availableDates = filterDatesByProgramYear(
    allCachedDates,
    selectedProgramYear
  ).sort((a, b) => b.localeCompare(a))

  if (!districtId || !clubId) {
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
            crumbs={[
              { label: districtName, to: `/district/${districtId}` },
              {
                label: 'Growth',
                to: `/district/${districtId}/growth${growthQuery}`,
              },
              { label: clubName ?? `Prospective club ${clubId}` },
            ]}
          />

          <DistrictSubnav districtId={districtId} />

          {isLoading || !model || !effectiveEndDate ? (
            <LoadingSkeleton variant="card" />
          ) : (
            <ProspectiveClubView
              model={model}
              districtId={districtId}
              asOfDate={effectiveEndDate}
              growthQuery={growthQuery}
            />
          )}
        </div>
      </div>
    </ErrorBoundary>
  )
}

export default DistrictProspectiveClubPage
