import React, { useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useUrlDatePair } from '../hooks/useUrlDatePair'
import { useDistrictRegionHistory } from '../hooks/useDistrictRegionHistory'
import { useRankingsPair, useRecordedDates } from '../hooks/useRankingsChanges'
import { RollupPageShell } from '../components/rollups/RollupPageShell'
import { RankingsChangesView } from '../components/rollups/RankingsChangesView'
import { formatDisplayDate as fmtDate } from '../utils/dateFormatting'
import { DatePairPicker } from '../components/DatePairPicker'
import { DatePairPresetChips } from '../components/DatePairPresetChips'
import { LoadingSkeleton } from '../components/LoadingSkeleton'
import { normaliseRegionId } from '../utils/regionId'
import { regionMembershipFor } from '../utils/regionHistory'
import { getProgramYearForDate } from '../utils/programYear'

/* Region and world What Changed (#2476, phase 1): `/region/:n/changes` and
   `/regions/changes`, routed subpages of the region pages (ADR-005). What
   moved between two dates at district grain, from the two dates'
   all-districts rankings files.

   The page owns the from/to pair (URL-synced by useUrlDatePair, with the
   district page's presets and pickers) and the region, and passes them down
   (R3). The dates are the per-district snapshot index's, the district page's
   own (see useRankingsChanges). A district counts toward the region it
   belonged to in each date's program year (#1821): the history's mapping,
   else the row's own region. Each invalid pair has its own prompt (R17). */

const RankingsChangesPage: React.FC = () => {
  const { n } = useParams<{ n: string }>()
  const region = n === undefined ? undefined : normaliseRegionId(n)
  const title = region ? `Region ${region}` : 'All regions'
  // The tab says "Worldwide" like its siblings; the on-page scope stays
  // "All regions".
  useDocumentTitle(`${region ? title : 'Worldwide'} — What Changed`)

  const { dates, isLoading: datesLoading } = useRecordedDates()
  const { from, to, setFrom, setTo, setPair } = useUrlDatePair(dates)

  const sameDate = !!from && !!to && from === to
  const reversed = !!from && !!to && from > to
  const invalidPair = sameDate || reversed
  const pair = useRankingsPair(
    invalidPair ? undefined : from,
    invalidPair ? undefined : to
  )

  const { history } = useDistrictRegionHistory()
  const regionOfFrom = useMemo(
    () =>
      regionMembershipFor(
        history,
        from ? getProgramYearForDate(from).label : ''
      ),
    [history, from]
  )
  const regionOfTo = useMemo(
    () =>
      regionMembershipFor(history, to ? getProgramYearForDate(to).label : ''),
    [history, to]
  )
  const inScope =
    !region ||
    pair.fromRows.some(r => regionOfFrom(r) === region) ||
    pair.toRows.some(r => regionOfTo(r) === region)

  const enoughHistory = !datesLoading && dates.length >= 2
  const lede = region
    ? `What moved across the districts of Region ${region} between two recorded dates: paid clubs, payments and Distinguished clubs, each district’s rank in the region, and its suspended and new-charter counts.`
    : 'What moved worldwide between two recorded dates: paid clubs, payments and Distinguished clubs, region by region, and the districts that moved most.'
  const base = region ? `/region/${region}` : '/regions'

  return (
    <RollupPageShell
      title={title}
      eyebrow={`${region ? `Toastmasters Region ${region}` : 'Toastmasters regions'} · What Changed`}
      lede={lede}
      back={{ label: title, to: base }}
      trail={[
        { label: 'Regions', to: '/regions' },
        ...(region ? [{ label: title, to: base }] : []),
        { label: 'What Changed' },
      ]}
      subnavBase={base}
    >
      <section aria-label="What changed" className="district-changes">
        {(datesLoading || enoughHistory) && (
          <div className="district-changes__controls">
            <DatePairPresetChips
              dates={dates}
              from={from}
              to={to}
              onSelect={setPair}
            />
            <DatePairPicker
              dates={dates}
              from={from}
              to={to}
              onFromChange={setFrom}
              onToChange={setTo}
            />
          </div>
        )}

        {!datesLoading && dates.length < 2 && (
          <p className="district-changes__empty" data-testid="changes-single">
            A change digest needs at least two recorded dates — check back after
            the next update.
          </p>
        )}
        {enoughHistory && sameDate && (
          <p
            className="district-changes__empty"
            data-testid="changes-same-date"
          >
            Pick two different dates to see what changed.
          </p>
        )}
        {enoughHistory && reversed && (
          <p className="district-changes__empty" data-testid="changes-reversed">
            Pick a “from” date that comes before the “to” date.
          </p>
        )}

        {!invalidPair && (datesLoading || pair.isLoading) && (
          // Taller than the district page's 220px: the loaded tiles plus
          // the table run past the first screen, so a slot this tall keeps
          // the footer below the fold while the two files load (CLS).
          <LoadingSkeleton variant="card" height="600px" />
        )}
        {!invalidPair && !pair.isLoading && pair.isError && (
          <p className="district-changes__empty" data-testid="changes-error">
            Couldn’t load the rankings for these dates. Please try again.
          </p>
        )}
        {!invalidPair && !pair.isLoading && pair.missing.length > 0 && (
          <p className="district-changes__empty" data-testid="changes-missing">
            No rankings were recorded for{' '}
            {pair.missing.map(d => fmtDate(d)).join(' or ')}. Pick another date.
          </p>
        )}

        {enoughHistory &&
          !invalidPair &&
          from &&
          to &&
          !pair.isLoading &&
          !pair.isError &&
          pair.missing.length === 0 &&
          (inScope ? (
            <RankingsChangesView
              scopeLabel={title}
              region={region}
              from={from}
              to={to}
              fromRows={pair.fromRows}
              toRows={pair.toRows}
              regionOfFrom={regionOfFrom}
              regionOfTo={regionOfTo}
            />
          ) : (
            <p
              className="district-changes__empty"
              data-testid="changes-empty-region"
            >
              No districts were in Region {region} on either date.
            </p>
          ))}
      </section>
    </RollupPageShell>
  )
}

export default RankingsChangesPage
