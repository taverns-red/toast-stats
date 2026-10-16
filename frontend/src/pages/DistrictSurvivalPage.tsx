import React, { useMemo } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useDistricts } from '../hooks/useDistricts'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useDistrictCachedDates } from '../hooks/useDistrictData'
import { useUrlProgramYear } from '../hooks/useUrlProgramYear'
import { useCharterCohortSurvival } from '../hooks/useCharterCohortSurvival'
import {
  getAvailableProgramYears,
  filterDatesByProgramYear,
} from '../utils/programYear'
import { DistrictDetailHeader } from '../components/DistrictDetailHeader'
import { SubpageBreadcrumb } from '../components/SubpageBreadcrumb'
import { DistrictSubnav } from '../components/DistrictSubnav'
import { CharterSurvivalView } from '../components/CharterSurvivalView'
import { LoadingSkeleton } from '../components/LoadingSkeleton'
import ErrorBoundary from '../components/ErrorBoundary'

/* District charter cohort survival (#1817, epic #1781) —
   `/district/:id/growth/survival`, under Club Growth (Growth stays current
   in the section nav; the breadcrumb leads back through it). "Of the clubs chartered here in PY X, how many
   are still active 1, 3, 5 years later?" Read from the district's survival
   file (#2061, `config/charter-cohort-survival/district_<id>.json`, a few
   KB), folded by the pipeline from the club-district history (#1782), which
   follows a club across district moves. While that file is missing the
   page folds the 100 history shards itself, with the same fold. The
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

  const history = useCharterCohortSurvival(
    districtId ?? '',
    effectiveProgramYear?.label ?? null
  )
  const survival = history.survival

  // The Growth crumb keeps the page's PY and date (R3: read from the URL).
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
    // (seconds later on the 100-shard fallback) never pushes the shell
    // footer (CLS).
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
            crumbs={[
              { label: districtName, to: `/district/${districtId}` },
              {
                label: 'Growth',
                to: `/district/${districtId}/growth${growthQuery}`,
              },
              { label: 'Club survival' },
            ]}
          />

          <DistrictSubnav districtId={districtId} />

          {body}
        </div>
      </div>
    </ErrorBoundary>
  )
}

export default DistrictSurvivalPage
