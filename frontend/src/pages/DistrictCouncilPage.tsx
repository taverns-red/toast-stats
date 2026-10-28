import React, { useId, useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useDistricts } from '../hooks/useDistricts'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useDistrictCachedDates } from '../hooks/useDistrictData'
import { useCouncilStanding } from '../hooks/useCouncilStanding'
import { useUrlState } from '../hooks/useUrlState'
import { SubpageBreadcrumb } from '../components/SubpageBreadcrumb'
import { DistrictSubnav } from '../components/DistrictSubnav'
import { ContextBar } from '../components/ContextBar'
import { LoadingSkeleton } from '../components/LoadingSkeleton'
import { ExportButton } from '../components/ExportButton'
import { RedVotePromo } from '../components/RedVotePromo'
import ErrorBoundary from '../components/ErrorBoundary'
import { exportCouncilStanding } from '../utils/csvExport'
import {
  COUNCIL_DISCLAIMER,
  COUNCIL_STALE_DAYS,
  groupByDivision,
  resolveCouncilSnapshot,
  type CouncilRow,
} from '../utils/councilStanding'

/* District Council credentials (#2300) — `/district/:id/council?date=`.
   For a Credentials Chair before a council meeting: which clubs are in good
   standing on the council date, their votes (2 each) and the quorum. A routed
   page reached from the Overview and the Red Vote card, deliberately not in
   the district subnav (Ron, 2026-10-28). The council date lives in the URL so
   a link is the answer; the page resolves the snapshot and passes it to the
   hook (R3). The data is TI's own club status, never recomputed. */

const ABOUT =
  'Clubs in good standing and their votes as of a District Council date, derived from TI’s club status. Not TI’s official credentials list.'

const METHODOLOGY_HREF = '/methodology#council-voting-strength'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const DATE_PARAM_OPTS = {
  parse: (v: string) => (ISO_DATE.test(v) ? v : undefined),
  serialize: (v: string) => v,
}

/** "Oct 8, 2026". Date-only, UTC-safe. */
function fmtDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

/** Today in the viewer's time zone, as an ISO date. */
function localTodayIso(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function daysPhrase(n: number): string {
  return `${n} ${n === 1 ? 'day' : 'days'}`
}

const ClubGroup: React.FC<{
  heading: string
  rows: CouncilRow[]
  districtId: string
  good: boolean
}> = ({ heading, rows, districtId, good }) => {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className="council-group">
      <h2 id={headingId} className="council-group__heading">
        {heading} ({rows.length})
      </h2>
      {rows.length === 0 ? (
        <p className="council-note">None.</p>
      ) : (
        groupByDivision(rows).map(division => (
          <div key={division.divisionId} className="council-division">
            <h3 className="council-division__heading">
              {division.divisionName}
            </h3>
            <table
              className={`council-table${good ? ' council-table--good' : ''}`}
            >
              <thead>
                <tr>
                  <th scope="col">Club</th>
                  <th scope="col">Area</th>
                  <th scope="col">{good ? 'Votes' : 'Reason'}</th>
                </tr>
              </thead>
              <tbody>
                {division.rows.map(r => (
                  <tr key={r.clubId}>
                    <td>
                      <Link
                        to={`/district/${districtId}/club/${r.clubId}`}
                        className="council-table__club"
                      >
                        {r.clubName}
                      </Link>
                      <span className="council-table__num">#{r.clubId}</span>
                    </td>
                    <td>{r.areaId}</td>
                    <td>{good ? r.votes : r.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}
    </section>
  )
}

const DistrictCouncilPage: React.FC = () => {
  const { districtId } = useParams<{ districtId: string }>()
  const dateInputId = useId()

  const { data: districtsData } = useDistricts()
  const selectedDistrict = districtsData?.districts?.find(
    d => d.id === districtId
  )
  const rawName = selectedDistrict?.name || districtId || ''
  const districtName = /^\d+$/.test(rawName) ? `District ${rawName}` : rawName
  useDocumentTitle(
    districtName ? `${districtName} — Council credentials` : null
  )

  const { data: cachedDates, isLoading: datesLoading } = useDistrictCachedDates(
    districtId || ''
  )
  const dates = useMemo(() => cachedDates?.dates ?? [], [cachedDates?.dates])
  const firstDate = dates[0]
  const latestDate = dates[dates.length - 1]

  const [urlDate, setUrlDate] = useUrlState('date', '', DATE_PARAM_OPTS)
  const councilDate = urlDate || latestDate || ''

  const resolution = useMemo(
    () =>
      councilDate
        ? resolveCouncilSnapshot(dates, councilDate, localTodayIso())
        : null,
    [dates, councilDate]
  )
  const usable =
    resolution !== null &&
    resolution.status !== 'none' &&
    resolution.status !== 'period-mismatch'
  const snapshotDate = usable ? resolution.snapshotDate : undefined

  const {
    data: standing,
    isLoading: standingLoading,
    isError,
  } = useCouncilStanding(districtId, snapshotDate)

  if (!districtId) return null

  return (
    <ErrorBoundary>
      <div className="district-detail-page-root">
        <div className="district-detail-page">
          <ContextBar
            title={districtName}
            back={{ label: districtName, to: `/district/${districtId}` }}
            chipLabel="About"
            about={ABOUT}
            trail={[
              { label: 'Districts', to: '/' },
              { label: districtName, to: `/district/${districtId}` },
              { label: 'Council credentials' },
            ]}
          />
          <p className="council-eyebrow">{districtName}</p>
          <h1 className="council-title">Council credentials</h1>
          <p className="council-lede">{ABOUT}</p>

          <SubpageBreadcrumb
            crumbs={[{ label: districtName, to: `/district/${districtId}` }]}
          />

          <DistrictSubnav districtId={districtId} />

          <section aria-label="Council credentials" className="council">
            <div className="council-controls">
              <label htmlFor={dateInputId} className="council-controls__label">
                Council date
              </label>
              <input
                id={dateInputId}
                type="date"
                className="council-controls__input"
                value={councilDate}
                {...(firstDate ? { min: firstDate } : {})}
                onChange={e => {
                  const v = e.target.value
                  if (ISO_DATE.test(v)) setUrlDate(v)
                }}
              />
            </div>

            {datesLoading && <LoadingSkeleton variant="card" height="220px" />}

            {resolution?.status === 'none' && (
              <p className="council-note" data-testid="council-none">
                {resolution.firstDate
                  ? `No TI data for ${districtName} on or before ${fmtDate(councilDate)}. The first is ${fmtDate(resolution.firstDate)}.`
                  : `No TI data has been recorded for ${districtName} yet.`}
              </p>
            )}

            {resolution?.status === 'period-mismatch' && (
              <p
                className="council-note council-note--notice"
                data-testid="council-period-mismatch"
                role="status"
              >
                No count for {fmtDate(councilDate)}. That date is in the{' '}
                {resolution.councilPeriod.label}, and the nearest TI data on or
                before it is from {fmtDate(resolution.snapshotDate)}, in the{' '}
                {resolution.snapshotPeriod.label}. Every club&apos;s standing
                resets when a dues period opens (April 1 and October 1), so that
                data says nothing about this date.
                {councilDate > (latestDate ?? '') &&
                  ' Check back once TI publishes data for the new period.'}
              </p>
            )}

            {usable && (
              <>
                <p className="council-note" data-testid="council-source">
                  Using TI data from {fmtDate(resolution.snapshotDate)}
                  {resolution.gapDays === 0
                    ? ' (the council date).'
                    : ` (${daysPhrase(resolution.gapDays)} before).`}
                </p>
                {resolution.status === 'stale' && (
                  <p
                    className="council-note council-note--notice"
                    data-testid="council-stale"
                  >
                    The TI data is {daysPhrase(resolution.gapDays)} older than
                    the council date (more than {COUNCIL_STALE_DAYS}). Clubs
                    that paid dues in between are not counted.
                  </p>
                )}
                {resolution.status === 'future' && (
                  <p
                    className="council-note council-note--notice"
                    data-testid="council-future"
                  >
                    The council date is in the future, so this is the latest TI
                    data. Clubs that pay their dues before{' '}
                    {fmtDate(councilDate)} will gain standing.
                  </p>
                )}
              </>
            )}

            {usable && standingLoading && (
              <LoadingSkeleton variant="card" height="220px" />
            )}

            {usable && isError && (
              <p className="council-note" data-testid="council-error">
                Couldn’t load the TI data for {districtName}. Please try again.
              </p>
            )}

            {usable && standing && (
              <>
                <div
                  className="council-headline"
                  data-testid="council-headline"
                >
                  <div className="council-stat">
                    <p className="council-stat__label">
                      Clubs in good standing
                    </p>
                    <p
                      className="council-stat__value"
                      data-testid="council-good"
                    >
                      {standing.goodCount}
                    </p>
                    <p className="council-stat__cite">
                      TI status Active (Policy 2.0 §4)
                    </p>
                  </div>
                  <div className="council-stat">
                    <p className="council-stat__label">Club votes</p>
                    <p
                      className="council-stat__value"
                      data-testid="council-votes"
                    >
                      {standing.clubVotes}
                    </p>
                    <p className="council-stat__cite">
                      2 per club (DAB Art. IX(a), X(d))
                    </p>
                  </div>
                  <div className="council-stat">
                    <p className="council-stat__label">Quorum</p>
                    <p
                      className="council-stat__value"
                      data-testid="council-quorum"
                    >
                      {standing.quorumClubs}
                    </p>
                    <p className="council-stat__cite">
                      clubs: one-third of {standing.goodCount}, rounded up (DAB
                      Art. X(c))
                    </p>
                  </div>
                </div>

                <p
                  className="council-note council-disclaimer"
                  data-testid="council-disclaimer"
                >
                  {COUNCIL_DISCLAIMER} District Executive Committee members also
                  vote and are not counted here.{' '}
                  <Link to={METHODOLOGY_HREF} className="council-link">
                    How this is worked out
                  </Link>
                </p>

                <div className="council-export">
                  <ExportButton
                    onExport={() =>
                      exportCouncilStanding({
                        districtId,
                        snapshotDate: resolution.snapshotDate,
                        councilDate,
                        rows: standing.rows,
                      })
                    }
                  />
                </div>

                <ClubGroup
                  heading="In good standing"
                  rows={standing.good}
                  districtId={districtId}
                  good
                />
                <ClubGroup
                  heading="Not in good standing"
                  rows={standing.notGood}
                  districtId={districtId}
                  good={false}
                />
              </>
            )}
          </section>

          {/* Red Vote (#2090): last on the page and only once the page has
              settled, so it never pushes data down. Date-only, no club data. */}
          {!datesLoading && !(usable && standingLoading) && <RedVotePromo />}
        </div>
      </div>
    </ErrorBoundary>
  )
}

export default DistrictCouncilPage
