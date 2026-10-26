import React, { useMemo } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useProgramYearControls } from '../hooks/useProgramYearControls'
import { useRegionRollups } from '../hooks/useRegionRollups'
import { useUrlSort } from '../hooks/useUrlSort'
import { SortableHeader } from '../components/SortableHeader'
import {
  RollupPageShell,
  RollupSkeleton,
} from '../components/rollups/RollupPageShell'
import { normaliseRegionId } from '../utils/regionId'
import { getOfficerTrainingRounds } from '@taverns-red/analytics-core'
import { formatShortDate } from '../utils/dateFormatting'
import {
  ALL_OFFICERS,
  DEFAULT_TRAINING_THRESHOLD,
  formatPct,
  parseTrainingThreshold,
  roundMonths,
  roundStatus,
  thresholdOptionLabel,
  trainingPageUrl,
  type TrainingRound,
} from '../utils/officerTraining'
import {
  rankingRound,
  regionTrainingRows,
  sortRegionTrainingRows,
  type RegionTrainingMetric,
} from '../utils/regionTraining'

/* /region/:n/training (#2296) — the region's districts compared on club
   officer training (DCP goal 9): for each round, % of clubs with 4+ officers
   trained, % with all seven and % at the selected threshold. One read, the
   date's `region-rollups.json` (the file Health & compliance reads), never a
   fetch per district. A routed sibling of /region/:n (ADR-005, no tabs);
   program year and date are the page's own (R3), the threshold is
   `?threshold=` (1–7, default 4) and the sort is `?sort=&dir=`. Each
   district links to its own Training page at the same threshold. */

const SORT_FIELDS = [
  'district',
  'r1-threshold',
  'r1-dcp',
  'r1-allSeven',
  'r2-threshold',
  'r2-dcp',
  'r2-allSeven',
] as const
type SortField = (typeof SORT_FIELDS)[number]

const parseField = (
  field: SortField
): { round: TrainingRound; metric: RegionTrainingMetric } | null => {
  if (field === 'district') return null
  const [r, metric] = field.split('-') as [string, RegionTrainingMetric]
  return { round: r === 'r1' ? 1 : 2, metric }
}

const RegionTrainingPage: React.FC = () => {
  const { n } = useParams<{ n: string }>()
  const region = normaliseRegionId(n)
  const controls = useProgramYearControls()
  const [searchParams, setSearchParams] = useSearchParams()
  const threshold = parseTrainingThreshold(searchParams.get('threshold'))
  const { rollups, snapshotDate, isLoading } = useRegionRollups(
    controls.effectiveDate
  )
  const date = snapshotDate ?? controls.effectiveDate ?? null
  const programYear = controls.selectedProgramYear.label
  const defaultRound = date ? rankingRound(date, programYear) : 1
  // A round that has not opened on the page's date has no figures to
  // compare (every club reads 0): show its opening date, never 0%.
  const windows = getOfficerTrainingRounds(programYear)
  const upcoming = (round: TrainingRound) =>
    date !== null && roundStatus(windows[round - 1]!, date) === 'upcoming'

  const { sort, toggleSort } = useUrlSort<SortField>({
    fields: SORT_FIELDS,
    // The default sort is a column on screen (review N5): at 4 that is
    // "4+", at 7 "All 7", otherwise the threshold's own column.
    defaultField: `r${defaultRound}-${
      threshold === DEFAULT_TRAINING_THRESHOLD
        ? 'dcp'
        : threshold === ALL_OFFICERS
          ? 'allSeven'
          : 'threshold'
    }` as SortField,
    defaultDirection: 'desc',
    newFieldDirection: 'desc',
  })

  const rows = useMemo(
    () => (rollups ? regionTrainingRows(rollups, region, threshold) : []),
    [rollups, region, threshold]
  )
  const sorted = useMemo(() => {
    const by = sort.field ? parseField(sort.field) : null
    if (!by) {
      const byId = [...rows]
      return sort.direction === 'desc' ? byId.reverse() : byId
    }
    return sortRegionTrainingRows(rows, by, sort.direction)
  }, [rows, sort])

  const measured = rows.some(r => r.rounds[0] || r.rounds[1])
  const showThreshold =
    threshold !== DEFAULT_TRAINING_THRESHOLD && threshold !== ALL_OFFICERS
  const metrics: Array<{ metric: RegionTrainingMetric; label: string }> = [
    ...(showThreshold
      ? [{ metric: 'threshold' as const, label: `${threshold}+` }]
      : []),
    { metric: 'dcp', label: '4+' },
    { metric: 'allSeven', label: 'All 7' },
  ]
  const title = `Region ${region}`

  return (
    <RollupPageShell
      title={title}
      eyebrow={`Toastmasters Region ${region} · Officer training`}
      lede={`Club officer training (DCP goal 9) across the districts of Region ${region}: the share of clubs with 4+ officers trained and with all seven, in each round. Select a district for its clubs.`}
      back={{ label: title, to: `/region/${region}` }}
      trail={[
        { label: 'Regions', to: '/regions' },
        { label: title, to: `/region/${region}` },
        { label: 'Officer training' },
      ]}
      subnavBase={`/region/${region}`}
      controls={controls}
    >
      <div className="action-list-page__controls">
        <div className="action-list-scope" role="group" aria-label="Threshold">
          <label className="action-list-scope__field">
            <span className="action-list-scope__label">Threshold</span>
            <select
              className="action-list-scope__select"
              value={threshold}
              onChange={e => {
                const next = Number(e.target.value)
                setSearchParams(
                  prev => {
                    const params = new URLSearchParams(prev)
                    if (next === DEFAULT_TRAINING_THRESHOLD)
                      params.delete('threshold')
                    else params.set('threshold', String(next))
                    return params
                  },
                  { replace: true }
                )
              }}
            >
              {Array.from({ length: ALL_OFFICERS }, (_, i) => i + 1).map(t => (
                <option key={t} value={t}>
                  {thresholdOptionLabel(t)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {isLoading && <RollupSkeleton />}
      {!isLoading && rows.length === 0 && (
        <p className="rollup-page__empty" data-testid="rollups-unavailable">
          {rollups
            ? (rollups.regionMembershipNote ??
              `Region ${region} is not in the rollups for this date.`)
            : 'Region rollups are not published for this date.'}
        </p>
      )}
      {!isLoading && rows.length > 0 && !measured && (
        <p className="rollup-page__empty" data-testid="training-unavailable">
          Officer-training figures are not in this date&apos;s region rollup.
          They are recorded with each daily snapshot from the day the figure was
          added; earlier dates predate it.
        </p>
      )}
      {!isLoading && measured && (
        <section aria-labelledby="region-training-heading">
          <h2 id="region-training-heading" className="rollup-section__title">
            Districts
          </h2>
          <div
            className="overflow-x-auto region-training__scroll"
            role="region"
            tabIndex={0}
            aria-label={`Region ${region} districts by officer training — scroll horizontally for both rounds`}
          >
            <table
              className="districts-rankings-table region-training-table"
              data-testid="region-training-table"
            >
              <caption className="sr-only">
                Region {region} districts: % of clubs by officers trained, per
                round
              </caption>
              <thead>
                <tr>
                  <SortableHeader<SortField>
                    field="district"
                    label="District"
                    currentSort={sort}
                    onSort={toggleSort}
                    rowSpan={2}
                  />
                  <th scope="col" rowSpan={2} className="text-right">
                    Clubs
                  </th>
                  {([1, 2] as const).map(round => (
                    // #2318 — each part stays whole; the cell wraps only
                    // between them (a phone broke "(Jun–" from "Aug)").
                    <th key={round} scope="colgroup" colSpan={metrics.length}>
                      <span className="region-training-table__round-part">
                        Round {round}
                      </span>{' '}
                      <span className="region-training-table__round-part">
                        {roundMonths(round)}
                      </span>
                      {upcoming(round) && (
                        <>
                          {' '}
                          <span className="region-training-table__round-part">
                            · opens {formatShortDate(windows[round - 1]!.start)}
                          </span>
                        </>
                      )}
                    </th>
                  ))}
                </tr>
                <tr>
                  {([1, 2] as const).flatMap(round =>
                    metrics.map(m =>
                      // A round that has not opened has nothing to sort by
                      // (every club reads 0): a plain header (review N6).
                      upcoming(round) ? (
                        <th
                          key={`r${round}-${m.metric}`}
                          scope="col"
                          className="text-right"
                        >
                          {m.label}
                        </th>
                      ) : (
                        <SortableHeader<SortField>
                          key={`r${round}-${m.metric}`}
                          field={`r${round}-${m.metric}` as SortField}
                          label={m.label}
                          currentSort={sort}
                          onSort={toggleSort}
                          numeric
                        />
                      )
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {sorted.map(row => (
                  <tr key={row.districtId}>
                    <th scope="row" className="region-training-table__district">
                      <Link
                        to={trainingPageUrl(row.districtId, {
                          threshold,
                          py: searchParams.get('py'),
                          date: searchParams.get('date'),
                        })}
                        className="clubs-name-link"
                      >
                        District {row.districtId}
                      </Link>
                    </th>
                    <td className="text-right tabular-nums">{row.clubs}</td>
                    {([1, 2] as const).flatMap(round =>
                      metrics.map(m => {
                        const f = upcoming(round) ? null : row.rounds[round - 1]
                        const value = !f
                          ? null
                          : m.metric === 'dcp'
                            ? f.pctDcp
                            : m.metric === 'allSeven'
                              ? f.pctAllSeven
                              : f.pctAtThreshold
                        return (
                          <td
                            key={`r${round}-${m.metric}`}
                            className="text-right tabular-nums"
                          >
                            {formatPct(value)}
                          </td>
                        )
                      })
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="training-note">
            Each round&apos;s share of the district&apos;s clubs. Counts are how
            many officers were trained, not which ones; &quot;—&quot; means the
            figure was not recorded for that district on this date, or the round
            has not opened yet.{' '}
            <Link to="/methodology#officer-training">How this is counted</Link>
          </p>
        </section>
      )}
    </RollupPageShell>
  )
}

export default RegionTrainingPage
