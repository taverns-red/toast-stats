import React from 'react'
import { Link } from 'react-router-dom'
import type { DistrictRecognitionTier } from '@taverns-red/analytics-core'
import type {
  NearestDistrict,
  RecognitionScoreboard,
} from '../utils/regionRecognition'

/* Region page District Recognition scoreboard (#2307): one card per tier of
   the program year's ladder — districts meeting it now, and the nearest
   district below it with the counts it still needs. Reuses the KPI strip
   classes, so it carries the page's existing palette and breakpoints. */

const TIER_LABEL: Record<DistrictRecognitionTier, string> = {
  Distinguished: 'Distinguished',
  Select: 'Select',
  Presidents: "President's",
  Smedley: 'Smedley',
}

const plural = (n: number, one: string, many: string) =>
  `${n.toLocaleString()} ${n === 1 ? one : many}`

function nearestText(n: NearestDistrict): string {
  const parts: string[] = []
  if (n.paidClubsRemaining > 0)
    parts.push(plural(n.paidClubsRemaining, 'paid club', 'paid clubs'))
  if (n.paymentsRemaining > 0)
    parts.push(plural(n.paymentsRemaining, 'payment', 'payments'))
  if (n.distinguishedClubsRemaining > 0)
    parts.push(
      plural(
        n.distinguishedClubsRemaining,
        'Distinguished club',
        'Distinguished clubs'
      )
    )
  const gap =
    parts.length === 0
      ? 'metrics met, prerequisites outstanding'
      : `${parts.join(', ')} to go`
  return `Nearest: District ${n.districtId} — ${gap}`
}

interface Props {
  scoreboard: RecognitionScoreboard | null
  /** "YYYY-YYYY", the page's selected program year (R3). */
  programYear: string
  /** Where last year's pace was measured; null = not available. */
  pace?: { referenceDate: string; referenceProgramYear: string } | null
  /** Phones (#2653): closed behind a one-line summary, opened by a tap. The
   *  caller passes it (R3: it owns the breakpoint); false renders it open. */
  collapsible?: boolean
}

/** The collapsed line: how many districts meet the lowest tier today. */
function glance(scoreboard: RecognitionScoreboard | null): string {
  const first = scoreboard?.rows[0]
  if (!scoreboard || !first) return 'Not available for this date'
  return `${first.meeting} of ${scoreboard.districts} districts ${TIER_LABEL[first.tier]} or higher`
}

export const RegionRecognitionScoreboard: React.FC<Props> = ({
  scoreboard,
  programYear,
  pace = null,
  collapsible = false,
}) => {
  const heading = (
    <h2
      id="region-recognition-heading"
      className="heading-section region-recognition__title"
    >
      District Recognition
    </h2>
  )
  const body = (
    <>
      <p className="text-sm text-gray-500" style={{ margin: '0 0 12px' }}>
        {scoreboard ? (
          <>
            Districts meeting each tier at this snapshot, under {programYear}{' '}
            rules.{' '}
            {pace ? (
              <>
                On track compares each district&apos;s pace with the median of
                the districts that earned it or higher in{' '}
                {pace.referenceProgramYear}, on{' '}
                <span style={{ whiteSpace: 'nowrap' }}>
                  {pace.referenceDate}
                </span>
                .{' '}
              </>
            ) : (
              <>Last year&apos;s pace is not available for this date. </>
            )}
          </>
        ) : (
          <>District Recognition status is not available for this date. </>
        )}
        <Link to="/methodology#region-recognition" className="methodology-link">
          How this is counted
        </Link>
      </p>
      {scoreboard && (
        <>
          <div className="districts-kpi-strip" style={{ marginBottom: 0 }}>
            {scoreboard.rows.map(row => (
              <div
                key={row.tier}
                className="districts-kpi-card"
                data-testid="recognition-tier"
                data-tier={row.tier}
              >
                <p className="districts-kpi-card__label">
                  {TIER_LABEL[row.tier]}
                </p>
                <div className="districts-kpi-card__value tabular-nums">
                  {row.meeting} of {scoreboard.districts}{' '}
                  <span className="text-xs text-gray-500 font-normal">
                    meet it today
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {row.nearest
                    ? nearestText(row.nearest)
                    : 'Every district meets this tier'}
                </p>
                {pace && (
                  <p
                    className="text-xs text-gray-500"
                    data-testid="recognition-on-track"
                    style={{
                      marginTop: 8,
                      paddingTop: 8,
                      borderTop: '1px solid var(--line)',
                    }}
                  >
                    On track, based on last year&apos;s pace:{' '}
                    <strong className="tabular-nums">
                      {row.onTrack === null
                        ? 'not available'
                        : `${row.onTrack} of ${scoreboard.districts}`}
                    </strong>
                  </p>
                )}
              </div>
            ))}
          </div>
          {scoreboard.unknown > 0 && (
            <p className="text-xs text-gray-500" style={{ marginTop: 8 }}>
              {plural(scoreboard.unknown, 'district earns', 'districts earn')} a
              tier on the metrics, but a required prerequisite is not reported
              yet; {scoreboard.unknown === 1 ? 'it is' : 'they are'} not counted
              as meeting it.
            </p>
          )}
        </>
      )}
    </>
  )
  return (
    <section
      aria-labelledby="region-recognition-heading"
      data-testid="region-recognition"
      style={{ marginBottom: 24 }}
    >
      {collapsible ? (
        <details className="region-recognition__details">
          <summary className="region-recognition__summary">
            {heading}
            <span className="region-recognition__glance">
              {glance(scoreboard)}
            </span>
          </summary>
          {body}
        </details>
      ) : (
        <>
          {heading}
          {body}
        </>
      )}
    </section>
  )
}
