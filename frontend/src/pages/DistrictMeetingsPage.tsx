import React, { useMemo } from 'react'
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
import { parseMeetingMode, parseMeetingSlot } from '../utils/meetingHeatmap'
import { DistrictDetailHeader } from '../components/DistrictDetailHeader'
import { SubpageBreadcrumb } from '../components/SubpageBreadcrumb'
import { DistrictSubnav } from '../components/DistrictSubnav'
import { MeetingHeatmap } from '../components/MeetingHeatmap'
import { LoadingSkeleton } from '../components/LoadingSkeleton'
import ErrorBoundary from '../components/ErrorBoundary'

/* District Meetings page (#1796, epic #1781) — `/district/:id/meetings`.
   For membership chairs and CGD: which evenings have no club, how many
   clubs can be joined online. Reads the parsed `meetingSchedule[]` (#1789)
   that the analytics file the other subpages already fetch carries on every
   club — no new fetch, no pipeline artifact. Mode (`?mode=`) and the
   selected cell (`?slot=`) are URL state, whitelisted at the parse; the
   program year and date come from the shared page controls and are passed
   down (R3). */

const DistrictMeetingsPage: React.FC = () => {
  const { districtId } = useParams<{ districtId: string }>()
  const [searchParams] = useSearchParams()
  const mode = parseMeetingMode(searchParams.get('mode'))
  const selection = parseMeetingSlot(searchParams.get('slot'))

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

  const { data: analytics, isLoading } = useDistrictAnalytics(
    hasValidDates ? districtId || null : null,
    effectiveProgramYear?.startDate,
    effectiveEndDate ?? undefined
  )

  const clubs = useMemo(() => analytics?.allClubs ?? [], [analytics])

  const mapContext = useMemo(
    () => ({
      ...(effectiveProgramYear
        ? { py: String(effectiveProgramYear.year) }
        : {}),
      ...(effectiveEndDate ? { date: effectiveEndDate } : {}),
    }),
    [effectiveProgramYear, effectiveEndDate]
  )

  const rawName = selectedDistrict?.name || districtId || ''
  const districtName = /^\d+$/.test(rawName) ? `District ${rawName}` : rawName
  useDocumentTitle(districtName ? `${districtName} Meeting Times` : null)

  const availableDates = cachedDatesInProgramYear.sort((a, b) =>
    b.localeCompare(a)
  )

  if (!districtId) {
    return null
  }

  const loading = !hasValidDates || (isLoading && clubs.length === 0)

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
          ) : clubs.length === 0 ? (
            <p className="meetings-note" role="status">
              No clubs to show for this district and date.
            </p>
          ) : (
            <MeetingHeatmap
              clubs={clubs}
              districtId={districtId}
              mode={mode}
              selection={selection}
              mapContext={mapContext}
            />
          )}
        </div>
      </div>
    </ErrorBoundary>
  )
}

export default DistrictMeetingsPage
