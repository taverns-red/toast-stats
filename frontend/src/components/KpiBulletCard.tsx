import React from 'react'
import { Tooltip, InfoIcon } from './Tooltip'
import { RegionRankChip } from './RegionRankChip'
import { toOrdinal } from '../utils/ordinal'
import type { MetricRankings, RecognitionTargets } from '../types/districts'

export interface KpiBulletCardProps {
  title: string
  current: number
  rankings: MetricRankings
  targets: RecognitionTargets | null
  tooltipContent?: string
  /**
   * Accessible name for the bullet bar. Falls back to a generated label
   * that includes the card title and the Smedley scale.
   */
  barAriaLabel?: string
}

type TierKey = keyof RecognitionTargets

interface TierTick {
  key: TierKey
  shortLabel: string
  fullLabel: string
  value: number
}

const TIERS: Omit<TierTick, 'value'>[] = [
  { key: 'distinguished', shortLabel: 'D', fullLabel: 'Distinguished' },
  { key: 'select', shortLabel: 'S', fullLabel: 'Select Distinguished' },
  {
    key: 'presidents',
    shortLabel: 'P',
    fullLabel: "President's Distinguished",
  },
  { key: 'smedley', shortLabel: 'Sm', fullLabel: 'Smedley Distinguished' },
]

function formatPercentile(percentile: number | null): string {
  if (percentile === null) return '—'
  const rankPercent = Math.round(100 - percentile)
  return `${toOrdinal(rankPercent)} percentile`
}

function formatPct(n: number): string {
  if (n >= 100) return '100%'
  return `${n.toFixed(2)}%`
}

interface BulletBarProps {
  current: number
  targets: RecognitionTargets
  title: string
  ariaLabel: string | undefined
}

const BulletBar: React.FC<BulletBarProps> = ({
  current,
  targets,
  title,
  ariaLabel,
}) => {
  // Real data always has Smedley > Distinguished > 0. Guard for synthetic
  // zero-target rows so tick positions never become NaN%.
  if (targets.smedley <= 0) return null

  // Zoom scale into the tier band so the four ticks have room to spread.
  // A [0, Smedley] scale crushed D/S/P/Sm into 93%–100% on real data —
  // labels collided and the bar was unreadable (#558). The scale below
  // auto-expands to include `current` whenever it lies outside the tier
  // band, so no clamping is needed and no "below-scale" affordance is
  // required — the marker is always on the bar. When the district has
  // hit Smedley, maxScale collapses to `current` so the marker pins to
  // 100% (a "you've made it" signal); the 5% headroom only applies when
  // there's still tier to chase.
  const allAchieved = current >= targets.smedley
  const minScale = Math.max(0, Math.min(current, 0.9 * targets.distinguished))
  const maxScale = allAchieved ? current : 1.05 * targets.smedley
  const range = maxScale - minScale
  const positionAt = (v: number): number => ((v - minScale) / range) * 100
  const markerPct = positionAt(current)

  const tiers: TierTick[] = TIERS.map(t => ({ ...t, value: targets[t.key] }))

  return (
    <>
      <div
        className="relative mt-8 pb-5"
        role="progressbar"
        aria-valuenow={current}
        aria-valuemin={0}
        aria-valuemax={targets.smedley}
        aria-label={
          ariaLabel ??
          `${title} — current ${current.toLocaleString()} of ${targets.smedley.toLocaleString()} (Smedley tier)`
        }
      >
        <div
          data-testid="current-marker"
          data-all-achieved={allAchieved ? 'true' : 'false'}
          className="absolute -top-7 flex flex-col items-center"
          style={{ left: formatPct(markerPct), transform: 'translateX(-50%)' }}
        >
          <span className="text-xs font-semibold leading-none text-gray-900">
            {current.toLocaleString()}
          </span>
          <span
            aria-hidden="true"
            className="text-xs leading-none text-tm-loyal-blue"
          >
            ▼
          </span>
        </div>

        <div className="relative h-2 rounded-full bg-gray-200">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-tm-loyal-blue"
            style={{ width: formatPct(markerPct) }}
          />
        </div>

        {/* Bare marks. The bar positions a tier by its value, and on a scale
          that also has to reach down to `current` the four tiers can land
          inside a few percent of each other — 9.4% for D61's payments,
          ~12px on the 2-column mobile card grid. That is enough room for a
          1px rule and for nothing else, so no text rides these coordinates
          (#1517). Kept as a direct child of the bar so the % offset resolves
          in the bar's coordinate space, not a Tooltip wrapper's (#559). */}
        {tiers.map(t => (
          <div
            key={t.key}
            data-testid={`tier-tick-${t.key}`}
            aria-hidden="true"
            className={`absolute top-3 h-2 w-px ${
              current >= t.value ? 'bg-tm-loyal-blue' : 'bg-gray-400'
            }`}
            style={{
              left: formatPct(positionAt(t.value)),
              transform: 'translateX(-50%)',
            }}
          />
        ))}
      </div>

      {/* The thresholds themselves, in normal flow. Flex + wrap means the
          browser guarantees the separation — there is no width budget to
          tune and no scale to re-zoom, so this holds at every viewport for
          every district, including one that has already passed Smedley.

          No tooltip and no focus stop here, deliberately. The old tick
          Tooltip carried the full tier name and value, but it hung off a 1px
          box that was unhittable by touch and — with no focusable child —
          unreachable by keyboard, so the value was hover-only in practice.
          Printing the value in the flow and the full name in an sr-only span
          makes both unconditional: no hover, no focus, no interaction. A
          focusable readout would also mint four sub-44px tap targets per
          card, which `e2e/touch-targets.smoke.ts` rightly reds. */}
      <ul
        data-testid="tier-legend"
        className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-xs leading-tight"
      >
        {tiers.map(t => (
          <li key={t.key} data-testid={`tier-legend-${t.key}`}>
            <span aria-hidden="true" className="font-medium text-gray-700">
              {t.shortLabel}
            </span>
            <span className="sr-only">{t.fullLabel}</span>{' '}
            <span className="text-gray-500">{t.value.toLocaleString()}</span>
          </li>
        ))}
      </ul>
    </>
  )
}

const DotSep: React.FC = () => (
  <span aria-hidden="true" className="text-gray-400">
    ·
  </span>
)

/**
 * Single-metric KPI card with a bullet-bar tier-progress visualization.
 * One bar carries the current-value marker plus four tier ticks
 * (D / S / P / Sm) showing Distinguished District thresholds.
 */
export const KpiBulletCard: React.FC<KpiBulletCardProps> = ({
  title,
  current,
  rankings,
  targets,
  tooltipContent,
  barAriaLabel,
}) => {
  const worldRankLabel =
    rankings.worldRank !== null && rankings.totalDistricts > 0
      ? `#${rankings.worldRank} of ${rankings.totalDistricts}`
      : '—'
  const worldRankTooltip =
    rankings.worldRank !== null
      ? "District's rank among all districts worldwide (1 = best)"
      : 'Ranking data unavailable - district may not have sufficient data for ranking'
  const percentileTooltip =
    rankings.worldPercentile !== null
      ? 'Percentage of districts this district outperforms worldwide'
      : 'Percentile data unavailable - requires world rank data'

  return (
    <div
      className="rounded-lg border border-gray-200 bg-white p-4"
      data-testid="kpi-bullet-card"
    >
      <div className="flex items-center gap-1">
        <h3 className="text-sm font-medium text-gray-700">{title}</h3>
        {tooltipContent && (
          <Tooltip content={tooltipContent}>
            <button
              type="button"
              aria-label="More info"
              className="inline-flex items-center justify-center rounded-full p-1 cursor-help focus:outline-none focus-visible:ring-2 focus-visible:ring-tm-loyal-blue"
            >
              <InfoIcon />
            </button>
          </Tooltip>
        )}
      </div>
      <p
        data-testid="kpi-value"
        className="mt-1 text-3xl font-bold text-gray-900"
      >
        {current.toLocaleString()}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-gray-600">
        <Tooltip content={worldRankTooltip}>
          <span data-testid="world-rank">{worldRankLabel}</span>
        </Tooltip>
        <DotSep />
        <Tooltip content={percentileTooltip}>
          <span data-testid="world-percentile">
            {formatPercentile(rankings.worldPercentile)}
          </span>
        </Tooltip>
        {rankings.region && (
          <>
            <DotSep />
            <RegionRankChip
              region={rankings.region}
              regionRank={rankings.regionRank}
            />
          </>
        )}
      </div>

      {targets ? (
        <BulletBar
          current={current}
          targets={targets}
          title={title}
          ariaLabel={barAriaLabel}
        />
      ) : (
        <div
          data-testid="targets-unavailable"
          role="status"
          aria-label={`${title} — recognition targets unavailable`}
          className="mt-3 text-xs text-gray-500"
        >
          Targets unavailable
        </div>
      )}
    </div>
  )
}

export default KpiBulletCard
