import { isClubSmedleyAvailable } from '@taverns-red/analytics-core'
import type {
  ClubDCPProjection,
  DistinguishedLevel,
} from '../../utils/dcpProjections'

// ── DCP Status Card ────────────────────────────────────────────────────────
// Re-skinned to club-reference.html (#619): a `.club-panel` with a bordered
// header, a 2-cell tier row (Current Level + Outlook), and a per-tier gap list.
// Health-based outlook (#231) and provisional-distinguished handling (#239)
// are preserved — the reference only depicts the on-track/confirmed case.

const OUTLOOK = {
  thriving: { label: 'On Track', icon: '✓', cell: 'dcp-cell--pos' },
  vulnerable: { label: 'At Risk', icon: '⚠', cell: 'dcp-cell--warn' },
  default: { label: 'Unlikely', icon: '✗', cell: 'dcp-cell--bad' },
} as const

function levelLabel(level: DistinguishedLevel): string {
  if (level === 'President') return "President's"
  if (level === 'NotDistinguished') return 'Not Distinguished'
  return level
}

export function DCPProjectionCard({
  projection,
  healthStatus,
  isProvisional,
  confirmedLevel,
  programYear,
  suspended = false,
}: {
  projection: ClubDCPProjection
  healthStatus: string
  isProvisional?: boolean
  confirmedLevel?: DistinguishedLevel
  /** The selected program year label ("2019-2020"): decides which tiers
   *  existed (#2639). */
  programYear: string
  /** A suspended club is not eligible for recognition (#2639). */
  suspended?: boolean
}) {
  const gaps = [
    { tier: 'Distinguished', gap: projection.gapToDistinguished },
    { tier: 'Select', gap: projection.gapToSelect },
    { tier: "President's", gap: projection.gapToPresident },
    // A rung that did not exist that year is a 0/0 gap, which would read as
    // "✓ Met"; leave it out, as getClosestTierLabel does (#2639, #1406).
    ...(isClubSmedleyAvailable(programYear)
      ? [{ tier: 'Smedley', gap: projection.gapToSmedley }]
      : []),
  ]

  const outlook =
    healthStatus === 'thriving'
      ? OUTLOOK.thriving
      : healthStatus === 'vulnerable'
        ? OUTLOOK.vulnerable
        : OUTLOOK.default

  const isAchieved = projection.currentLevel !== 'NotDistinguished'

  return (
    <section className="club-panel">
      <div className="club-panel__head">
        <h2>
          <svg
            className="club-panel__ico"
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.6}
            aria-hidden="true"
          >
            <path d="M3 13V8M8 13V3M13 13v-7" />
          </svg>
          DCP Status
        </h2>
      </div>
      <div className="club-panel__body">
        {/* Tier row: Current Level + Outlook */}
        <div className="dcp-tier-row">
          <div className="dcp-cell">
            <div className="dcp-cell__lab">Current Level</div>
            <div
              className={
                'dcp-cell__val' +
                (isAchieved ? ' dcp-cell__val--distinguished' : '')
              }
            >
              {levelLabel(projection.currentLevel)}
            </div>
            {isProvisional && (
              <div className="dcp-cell__provisional">
                Provisional
                {confirmedLevel && confirmedLevel !== 'NotDistinguished' && (
                  <span className="dcp-cell__provisional-confirmed">
                    {' '}
                    — Confirmed: {levelLabel(confirmedLevel)}
                  </span>
                )}
              </div>
            )}
          </div>
          <div className={`dcp-cell ${outlook.cell}`}>
            <div className="dcp-cell__lab">Outlook</div>
            <div className="dcp-cell__val">
              {outlook.icon} {outlook.label}
            </div>
          </div>
        </div>

        {/* Per-tier gap list */}
        {suspended ? (
          <p className="gap-section">
            Suspended clubs aren't eligible for recognition
          </p>
        ) : (
          <div className="gap-section">
            <h3>Gap to Each Tier</h3>
            {gaps.map(({ tier, gap }) => {
              const met = gap.goals === 0 && gap.members === 0
              const tierLevel = tier === "President's" ? 'President' : tier
              const isCurrentTier = tierLevel === projection.currentLevel
              const tierProvisional = isProvisional && isCurrentTier && met
              const rowClass = met
                ? tierProvisional
                  ? 'gap-row gap-row--provisional'
                  : 'gap-row gap-row--met'
                : 'gap-row'
              return (
                <div key={tier} className={rowClass}>
                  <span className="gap-row__tier">{tier}</span>
                  {met ? (
                    <span className="gap-row__val">
                      {tierProvisional ? '⚠ Provisional' : '✓ Met'}
                    </span>
                  ) : (
                    <span className="gap-row__val tabular-nums">
                      {gap.goals > 0 &&
                        `${gap.goals} goal${gap.goals > 1 ? 's' : ''}`}
                      {gap.goals > 0 && gap.members > 0 && ' + '}
                      {gap.members > 0 &&
                        `${gap.members} member${gap.members > 1 ? 's' : ''}`}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
