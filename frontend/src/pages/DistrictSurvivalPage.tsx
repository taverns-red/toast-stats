import React, { useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useDistricts } from '../hooks/useDistricts'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useDistrictCachedDates } from '../hooks/useDistrictData'
import { useUrlProgramYear } from '../hooks/useUrlProgramYear'
import { useClubDistrictHistory } from '../hooks/useClubDistrictHistory'
import {
  getAvailableProgramYears,
  filterDatesByProgramYear,
} from '../utils/programYear'
import { buildCharterCohortSurvival } from '../utils/charterCohortSurvival'
import { DistrictDetailHeader } from '../components/DistrictDetailHeader'
import { SubpageBreadcrumb } from '../components/SubpageBreadcrumb'
import { DistrictSubnav } from '../components/DistrictSubnav'
import { CharterSurvivalView } from '../components/CharterSurvivalView'
import { LoadingSkeleton } from '../components/LoadingSkeleton'
import ErrorBoundary from '../components/ErrorBoundary'

/* District charter cohort survival (#1817, epic #1781) —
   `/district/:id/survival`. "Of the clubs chartered here in PY X, how many
   are still active 1, 3, 5 years later?" Folded in the browser from the
   club-district history (#1782, `config/club-district-history/`), which
   follows a club across district moves — no new pipeline artifact. The
   program year comes from the shared URL-synced page controls and is passed
   down as the horizon (R3); the date control does not change the curves
   (the history is program-year granular). */

const DistrictSurvivalPage: React.FC = () => {
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

  const effectiveProgramYear = useMemo(() => {
    if (availableProgramYears.length === 0) return null
    const has = availableProgramYears.some(
      py => py.year === selectedProgramYear.year
    )
    if (has) return selectedProgramYear
    return availableProgramYears[0] ?? null
  }, [availableProgramYears, selectedProgramYear])

  const history = useClubDistrictHistory()

  const survival = useMemo(() => {
    if (
      !districtId ||
      !effectiveProgramYear ||
      history.status !== 'ready' ||
      !history.index ||
      !history.clubs
    ) {
      return null
    }
    return buildCharterCohortSurvival({
      index: history.index,
      clubs: history.clubs,
      districtId,
      throughProgramYear: effectiveProgramYear.label,
    })
  }, [districtId, effectiveProgramYear, history])

  const rawName = selectedDistrict?.name || districtId || ''
  const districtName = /^\d+$/.test(rawName) ? `District ${rawName}` : rawName
  useDocumentTitle(districtName ? `${districtName} Club Survival` : null)

  const availableDates = filterDatesByProgramYear(
    allCachedDates,
    selectedProgramYear
  ).sort((a, b) => b.localeCompare(a))

  if (!districtId) {
    return null
  }

  let body: React.ReactNode
  if (history.status === 'unavailable') {
    body = (
      <p className="survival-empty" role="status">
        The club history is not available right now, so survival cannot be
        counted. Try again later.
      </p>
    )
  } else if (!survival) {
    // The slot is reserved taller than the viewport, so the content landing
    // (seconds later: 100 shards) never pushes the shell footer (CLS).
    body = (
      <div className="survival-loading">
        <p className="survival-note" role="status">
          {history.total > 0
            ? `Loading club history: ${history.loaded} of ${history.total} files…`
            : 'Loading club history…'}
        </p>
        <LoadingSkeleton variant="card" />
      </div>
    )
  } else {
    body = <CharterSurvivalView survival={survival} />
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

          {body}
        </div>
      </div>
    </ErrorBoundary>
  )
}

export default DistrictSurvivalPage
