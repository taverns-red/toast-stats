import React, { useMemo } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { getOfficerTrainingRounds } from '@taverns-red/analytics-core'
import { useDistricts } from '../hooks/useDistricts'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useDistrictCachedDates } from '../hooks/useDistrictData'
import { useDistrictStatistics } from '../hooks/useMembershipData'
import { useTimeSeries } from '../hooks/useTimeSeries'
import { useUrlProgramYear } from '../hooks/useUrlProgramYear'
import {
  getAvailableProgramYears,
  filterDatesByProgramYear,
  getMostRecentDateInProgramYear,
  isDateInProgramYear,
} from '../utils/programYear'
import {
  ALL_OFFICERS,
  DEFAULT_TRAINING_THRESHOLD,
  distributionOf,
  filterTrainingClubs,
  parseTrainingThreshold,
  roundCurve,
  roundStatus,
  lastYearSnapshotFor,
  thresholdOptionLabel,
  trainingClubsFromSnapshot,
  trainingCsvRows,
  trainingRoundContext,
  type TrainingClub,
} from '../utils/officerTraining'
import { compareId } from '../utils/actionListData'
import { arrayToCSV, downloadCSV, generateFilename } from '../utils/csvExport'
import { formatDisplayDate } from '../utils/dateFormatting'
import { DistrictDetailHeader } from '../components/DistrictDetailHeader'
import { SubpageBreadcrumb } from '../components/SubpageBreadcrumb'
import { DistrictSubnav } from '../components/DistrictSubnav'
import { LoadingSkeleton } from '../components/LoadingSkeleton'
import { ActionTable, type ActionTableColumn } from '../components/ActionTable'
import type { MobileRow } from '../components/MobileRowList'
import { OfficerTrainingRoundPanel } from '../components/training/OfficerTrainingRoundPanel'
import ErrorBoundary from '../components/ErrorBoundary'

/* District Training page (#2296) — `/district/:id/training`.

   Club officer training (DCP goal 9: 4+ officers trained in Round 1, Jun–Aug,
   and in Round 2, Nov–Feb) rolled up for the district, a division or an
   area. Officer training is NOT part of the education program; it has its
   own page and its own methodology entry.

   Data, with no new fan-out:
   - The page's snapshot (the same `district_{id}.json` every district page
     reads) for the counts, the filters and the club list.
   - ONE more snapshot, the closest date one year earlier, for "this date last
     program year" — so the comparison respects the division/area filter.
   - The district time series (current + prior program years, the files the
     Trends page reads) for the progress curve. Points published before #2296
     carry no officer-training field; the curve starts where the record does.

   URL state: `?threshold=` (1–7, default 4, whitelisted at the parse),
   `?division=`, `?area=`; program year and date come from the shared page
   controls (R3). */

type RoundStatusByRound = Record<
  'round1' | 'round2',
  'open' | 'closed' | 'upcoming'
>

const TrainingCell: React.FC<{
  trained: number
  threshold: number
  upcoming: boolean
}> = ({ trained, threshold, upcoming }) =>
  // A round that has not opened reads 0 for every club: "—", never
  // "0 · needs 4" (review S1).
  upcoming ? (
    <span className="training-cell training-cell__need">—</span>
  ) : trained >= threshold ? (
    <span className="training-cell training-cell--met">{trained} ✓</span>
  ) : (
    <span className="training-cell">
      {trained}
      <span className="training-cell__need">
        {' '}
        · needs {threshold - trained}
      </span>
    </span>
  )

const clubColumns = (
  districtId: string,
  threshold: number,
  status: RoundStatusByRound
): ActionTableColumn<TrainingClub>[] => [
  {
    key: 'club',
    header: 'Club',
    className: 'action-table__subject',
    cell: c => (
      <Link
        className="action-table__link"
        to={`/district/${districtId}/club/${c.clubId}`}
      >
        {c.clubName}
      </Link>
    ),
  },
  {
    key: 'area',
    header: 'Area',
    className: 'action-table__area',
    cell: c => `${c.divisionId}/${c.areaId}`,
  },
  {
    key: 'round1',
    header: 'Round 1',
    cell: c => (
      <TrainingCell
        trained={c.round1}
        threshold={threshold}
        upcoming={status.round1 === 'upcoming'}
      />
    ),
  },
  {
    key: 'round2',
    header: 'Round 2',
    cell: c => (
      <TrainingCell
        trained={c.round2}
        threshold={threshold}
        upcoming={status.round2 === 'upcoming'}
      />
    ),
  },
]

const clubMobileRow =
  (districtId: string, threshold: number, status: RoundStatusByRound) =>
  (c: TrainingClub): MobileRow => {
    // "R1 5/4 ✓ · R2 2/4": trained over the threshold, short enough not to
    // truncate at 375; "R2 —" for a round that has not opened.
    const part = (label: string, n: number, upcoming: boolean) =>
      upcoming
        ? `${label} —`
        : `${label} ${n}/${threshold}${n >= threshold ? ' ✓' : ''}`
    return {
      id: c.clubId,
      to: `/district/${districtId}/club/${c.clubId}`,
      title: c.clubName,
      meta: `${c.divisionId}/${c.areaId} · ${part('R1', c.round1, status.round1 === 'upcoming')} · ${part('R2', c.round2, status.round2 === 'upcoming')}`,
    }
  }

const priorProgramYear = (label: string): string => {
  const start = Number(label.slice(0, 4)) - 1
  return `${start}-${start + 1}`
}

const DistrictTrainingPage: React.FC = () => {
  const { districtId } = useParams<{ districtId: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const threshold = parseTrainingThreshold(searchParams.get('threshold'))
  const division = searchParams.get('division') || undefined
  const area = searchParams.get('area') || undefined

  const setParam = (updates: Record<string, string | undefined>) => {
    setSearchParams(
      prev => {
        const params = new URLSearchParams(prev)
        for (const [key, value] of Object.entries(updates)) {
          if (value) params.set(key, value)
          else params.delete(key)
        }
        return params
      },
      { replace: true }
    )
  }

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
  const programYearLabel = effectiveProgramYear?.label ?? null

  // The page's snapshot (counts, filters, club list).
  const { data: snapshot, isLoading: snapshotLoading } = useDistrictStatistics(
    hasValidDates ? districtId || null : null,
    effectiveEndDate ?? undefined
  )

  // Last year's comparison, per round (review S2): a snapshot INSIDE last
  // year's same round — on or before the same day of it while this year's
  // round is open, its final in-round snapshot once closed. One read each.
  const lastYearByRound = useMemo(() => {
    if (!effectiveEndDate || !programYearLabel) return [null, null] as const
    const priorStart = Number(programYearLabel.slice(0, 4)) - 1
    const priorDates = allCachedDates.filter(d =>
      isDateInProgramYear(d, {
        year: priorStart,
        startDate: `${priorStart}-07-01`,
        endDate: `${priorStart + 1}-06-30`,
        label: `${priorStart}-${priorStart + 1}`,
      })
    )
    const [r1, r2] = getOfficerTrainingRounds(programYearLabel)
    return [
      lastYearSnapshotFor(r1, effectiveEndDate, priorDates),
      lastYearSnapshotFor(r2, effectiveEndDate, priorDates),
    ] as const
  }, [effectiveEndDate, programYearLabel, allCachedDates])
  const { data: lastYearSnapshot1 } = useDistrictStatistics(
    lastYearByRound[0] ? districtId || null : null,
    lastYearByRound[0]?.date
  )
  const { data: lastYearSnapshot2 } = useDistrictStatistics(
    lastYearByRound[1] ? districtId || null : null,
    lastYearByRound[1]?.date
  )

  // Current + prior program years' series for the progress curve.
  const { data: timeSeries } = useTimeSeries(
    hasValidDates ? districtId || null : null,
    programYearLabel ?? undefined
  )

  const allClubs = useMemo(
    () => trainingClubsFromSnapshot(snapshot),
    [snapshot]
  )
  const lastYearClubs = useMemo(
    () =>
      [
        trainingClubsFromSnapshot(lastYearSnapshot1),
        trainingClubsFromSnapshot(lastYearSnapshot2),
      ] as const,
    [lastYearSnapshot1, lastYearSnapshot2]
  )
  const scope = useMemo(() => ({ division, area }), [division, area])
  const clubs = useMemo(
    () =>
      allClubs
        ? filterTrainingClubs(allClubs, scope).sort(
            (a, b) =>
              compareId(a.divisionId, b.divisionId) ||
              compareId(a.areaId, b.areaId) ||
              a.clubName.localeCompare(b.clubName)
          )
        : null,
    [allClubs, scope]
  )
  const lastYearScoped = useMemo(
    () => lastYearClubs.map(c => (c ? filterTrainingClubs(c, scope) : null)),
    [lastYearClubs, scope]
  )

  const scopeOptions = useMemo(() => {
    const source = allClubs ?? []
    const divisions = [...new Set(source.map(c => c.divisionId))]
      .filter(Boolean)
      .sort(compareId)
    const areas = [
      ...new Set(
        source
          .filter(c => !division || c.divisionId === division)
          .map(c => c.areaId)
      ),
    ]
      .filter(Boolean)
      .sort(compareId)
    return { divisions, areas }
  }, [allClubs, division])

  const rawName = selectedDistrict?.name || districtId || ''
  const districtName = /^\d+$/.test(rawName) ? `District ${rawName}` : rawName
  useDocumentTitle(districtName ? `${districtName} Officer Training` : null)

  const availableDates = cachedDatesInProgramYear.sort((a, b) =>
    b.localeCompare(a)
  )

  if (!districtId) {
    return null
  }

  const context =
    effectiveEndDate && programYearLabel
      ? trainingRoundContext(effectiveEndDate, programYearLabel)
      : null
  const lastPy = programYearLabel ? priorProgramYear(programYearLabel) : null
  const lastRounds = lastPy ? getOfficerTrainingRounds(lastPy) : null
  const scopeLabel = area
    ? `Area ${area}`
    : division
      ? `Division ${division}`
      : districtName
  const scoped = Boolean(division || area)

  const loading = !hasValidDates || (snapshotLoading && !snapshot)

  const statusByRound = {
    round1:
      context && effectiveEndDate
        ? roundStatus(context.rounds[0], effectiveEndDate)
        : 'closed',
    round2:
      context && effectiveEndDate
        ? roundStatus(context.rounds[1], effectiveEndDate)
        : 'closed',
  } as const

  const handleExport = () => {
    if (!clubs) return
    downloadCSV(
      arrayToCSV(trainingCsvRows(clubs, threshold, statusByRound)),
      generateFilename('officer-training', districtId)
    )
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

          <div className="training-page" data-testid="training-page">
            <header className="training-page__intro">
              <h2 className="training-page__title">Club officer training</h2>
              <p className="training-page__subtitle">
                DCP goal 9 asks each club for 4 or more officers trained in
                Round 1 (June–August) and again in Round 2 (November–February).
                Toastmasters reports how many of a club&apos;s seven officers
                were trained, not which ones.{' '}
                <Link to="/methodology#officer-training">
                  How this is counted
                </Link>
              </p>
            </header>

            {context && (
              <p
                className="training-context"
                role="status"
                data-testid="training-context"
              >
                {context.open
                  ? `Round ${context.open.round} is open: ${context.daysLeft} day${context.daysLeft === 1 ? '' : 's'} left, to ${formatDisplayDate(context.open.end)}.`
                  : context.pendingOpen
                    ? `Round 1 of ${context.pendingOpen.programYear} opened ${formatDisplayDate(context.pendingOpen.start)}. Toastmasters publishes its counts after the program-year rollover in late July; this snapshot shows ${programYearLabel}'s final results.`
                    : `No round is open on ${formatDisplayDate(effectiveEndDate!)}. Round ${context.next.round}${context.next.programYear !== programYearLabel ? ` of ${context.next.programYear}` : ''} opens ${formatDisplayDate(context.next.start)}.`}
              </p>
            )}

            <div className="action-list-page__controls">
              <div
                className="action-list-scope"
                role="group"
                aria-label="Threshold and scope"
              >
                <label className="action-list-scope__field">
                  <span className="action-list-scope__label">Threshold</span>
                  <select
                    className="action-list-scope__select"
                    value={threshold}
                    onChange={e => {
                      const next = Number(e.target.value)
                      setParam({
                        threshold:
                          next === DEFAULT_TRAINING_THRESHOLD
                            ? undefined
                            : String(next),
                      })
                    }}
                  >
                    {Array.from({ length: ALL_OFFICERS }, (_, i) => i + 1).map(
                      n => (
                        <option key={n} value={n}>
                          {thresholdOptionLabel(n)}
                        </option>
                      )
                    )}
                  </select>
                </label>

                <label className="action-list-scope__field">
                  <span className="action-list-scope__label">Division</span>
                  <select
                    className="action-list-scope__select"
                    value={division ?? ''}
                    onChange={e =>
                      // Changing division clears any area from a prior division.
                      setParam({
                        division: e.target.value || undefined,
                        area: undefined,
                      })
                    }
                  >
                    <option value="">All divisions</option>
                    {scopeOptions.divisions.map(d => (
                      <option key={d} value={d}>
                        Division {d}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="action-list-scope__field">
                  <span className="action-list-scope__label">Area</span>
                  <select
                    className="action-list-scope__select"
                    value={area ?? ''}
                    onChange={e =>
                      setParam({ area: e.target.value || undefined })
                    }
                  >
                    <option value="">All areas</option>
                    {scopeOptions.areas.map(a => (
                      <option key={a} value={a}>
                        Area {a}
                      </option>
                    ))}
                  </select>
                </label>

                {scoped && (
                  <button
                    type="button"
                    className="action-list-scope__clear"
                    onClick={() =>
                      setParam({ division: undefined, area: undefined })
                    }
                  >
                    Clear filter
                  </button>
                )}
              </div>

              <button
                type="button"
                className="action-list-page__export"
                onClick={handleExport}
                disabled={!clubs || clubs.length === 0}
              >
                Export CSV
              </button>
            </div>

            {loading ? (
              <LoadingSkeleton variant="card" count={2} />
            ) : !clubs ? (
              <p className="training-note" role="status">
                This snapshot does not carry officer-training counts.
              </p>
            ) : (
              <>
                <h3 className="training-page__scope">
                  {scopeLabel} · {clubs.length} club
                  {clubs.length === 1 ? '' : 's'}
                </h3>
                <div className="training-rounds">
                  {context?.rounds.map(window => {
                    const lastWindow = lastRounds?.[window.round - 1]
                    const pyPoints =
                      timeSeries?.years[programYearLabel!]?.dataPoints
                    const lastPoints = lastPy
                      ? timeSeries?.years[lastPy]?.dataPoints
                      : undefined
                    return (
                      <OfficerTrainingRoundPanel
                        key={window.round}
                        window={window}
                        status={roundStatus(window, effectiveEndDate!)}
                        daysLeft={
                          context.open?.round === window.round
                            ? context.daysLeft
                            : null
                        }
                        threshold={threshold}
                        distribution={distributionOf(clubs, window.round)}
                        lastYear={(() => {
                          const pick = lastYearByRound[window.round - 1]
                          const scopedClubs = lastYearScoped[window.round - 1]
                          return pick && scopedClubs
                            ? {
                                date: pick.date,
                                kind: pick.kind,
                                distribution: distributionOf(
                                  scopedClubs,
                                  window.round
                                ),
                              }
                            : null
                        })()}
                        curve={{
                          // The published curve is district-wide: the series
                          // carries no division/area breakdown.
                          thisYear: roundCurve(pyPoints, window, threshold),
                          lastYear: lastWindow
                            ? roundCurve(lastPoints, lastWindow, threshold)
                            : [],
                          thisYearLabel: programYearLabel ?? '',
                          lastYearLabel: lastPy ?? '',
                        }}
                      />
                    )
                  })}
                </div>
                {scoped && (
                  <p className="training-note">
                    The progress curves are district-wide; the counts above are
                    for {scopeLabel}. Last year&apos;s figures use last
                    year&apos;s division and area assignments, which can differ.
                  </p>
                )}

                <section
                  className="training-clubs"
                  aria-labelledby="training-clubs-heading"
                >
                  <h3
                    id="training-clubs-heading"
                    className="training-page__scope"
                  >
                    Clubs · officers trained per round
                  </h3>
                  <ActionTable
                    caption={`Clubs in ${scopeLabel} by officers trained per round`}
                    columns={clubColumns(districtId, threshold, statusByRound)}
                    rows={clubs}
                    rowKey={c => c.clubId}
                    testId="training-club-table"
                    mobileRow={clubMobileRow(
                      districtId,
                      threshold,
                      statusByRound
                    )}
                  />
                </section>
              </>
            )}
          </div>
        </div>
      </div>
    </ErrorBoundary>
  )
}

export default DistrictTrainingPage
