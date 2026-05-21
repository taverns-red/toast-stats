import React from 'react'
import { Link } from 'react-router-dom'
import { Tooltip, InfoIcon } from './Tooltip'
import type { MetricRankings, RecognitionTargets } from '../types/districts'

export interface KpiBulletCardProps {
  title: string
  current: number
  rankings: MetricRankings
  targets: RecognitionTargets | null
  tooltipContent?: string
  /**
   * Accessible name for the bullet bar. When omitted, falls back to a
   * generated label that includes the card title and the Smedley scale.
   */
  barAriaLabel?: string
}

interface TierTick {
  key: 'distinguished' | 'select' | 'presidents' | 'smedley'
  shortLabel: string
  value: number
}

function ordinalSuffix(n: number): string {
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`
  const mod10 = n % 10
  if (mod10 === 1) return `${n}st`
  if (mod10 === 2) return `${n}nd`
  if (mod10 === 3) return `${n}rd`
  return `${n}th`
}

function formatPercentile(percentile: number | null): string {
  if (percentile === null) return '—'
  const rankPercent = Math.round(100 - percentile)
  return `${ordinalSuffix(rankPercent)} percentile`
}

function formatPct(n: number): string {
  if (n >= 100) return '100%'
  return `${n.toFixed(2)}%`
}

const RegionRankChip: React.FC<{
  region: string
  regionRank: number | null
}> = ({ region, regionRank }) => {
  const digits = String(region).match(/\d+/)?.[0]
  const tooltipContent =
    regionRank !== null
      ? `District's rank within ${region} region (1 = best)`
      : `Regional ranking data unavailable for ${region}`
  const label = (
    <>
      {region}: {regionRank !== null ? `#${regionRank}` : '—'}
    </>
  )
  const sharedClasses = 'px-2 py-1 rounded-sm bg-gray-100 text-gray-700'
  return (
    <Tooltip content={tooltipContent}>
      {digits ? (
        <Link
          to={`/region/${digits}`}
          className={`${sharedClasses} hover:bg-gray-200`}
          data-testid="region-rank"
          aria-label={`View Region ${digits} overview`}
        >
          {label}
        </Link>
      ) : (
        <span className={sharedClasses} data-testid="region-rank">
          {label}
        </span>
      )}
    </Tooltip>
  )
}

interface BulletBarProps {
  current: number
  targets: RecognitionTargets
  title: string
  ariaLabel: string | undefined
}

const TIERS: Pick<TierTick, 'key' | 'shortLabel'>[] = [
  { key: 'distinguished', shortLabel: 'D' },
  { key: 'select', shortLabel: 'S' },
  { key: 'presidents', shortLabel: 'P' },
  { key: 'smedley', shortLabel: 'Sm' },
]

const BulletBar: React.FC<BulletBarProps> = ({
  current,
  targets,
  title,
  ariaLabel,
}) => {
  const max = targets.smedley
  const markerRatio = max > 0 ? current / max : 0
  const markerPct = Math.min(100, markerRatio * 100)
  const allAchieved = current >= max

  const tiers: TierTick[] = TIERS.map(t => ({ ...t, value: targets[t.key] }))

  return (
    <div
      className="relative mt-8 pb-12"
      role="progressbar"
      aria-valuenow={current}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={
        ariaLabel ??
        `${title} — current ${current.toLocaleString()} of ${max.toLocaleString()} (Smedley tier)`
      }
    >
      {/* Current-value marker — value label + downward triangle above the bar */}
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

      {/* The bar itself */}
      <div className="relative h-2 rounded-full bg-gray-200">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-tm-loyal-blue"
          style={{ width: formatPct(markerPct) }}
        />
      </div>

      {/* Tier ticks — short vertical line + short label + threshold value */}
      {tiers.map(t => {
        const pos = (t.value / max) * 100
        const achieved = current >= t.value
        return (
          <div
            key={t.key}
            data-testid={`tier-tick-${t.key}`}
            className="absolute top-3 flex flex-col items-center text-xs"
            style={{ left: formatPct(pos), transform: 'translateX(-50%)' }}
          >
            <div
              aria-hidden="true"
              className={`h-2 w-px ${
                achieved ? 'bg-tm-loyal-blue' : 'bg-gray-400'
              }`}
            />
            <div className="mt-1 font-medium text-gray-700">{t.shortLabel}</div>
            <div className="text-gray-500">{t.value.toLocaleString()}</div>
          </div>
        )
      })}
    </div>
  )
}

/**
 * KpiBulletCard — #550 District Overview redesign
 *
 * Single-metric KPI card with a bullet-bar tier-progress visualization.
 * Replaces TargetProgressCard's four parallel progress bars with one
 * bar carrying a current-value marker + four tier ticks (D/S/P/Sm).
 */
export const KpiBulletCard: React.FC<KpiBulletCardProps> = ({
  title,
  current,
  rankings,
  targets,
  tooltipContent,
  barAriaLabel,
}) => {
  return (
    <div
      className="rounded-lg border border-gray-200 bg-white p-4"
      data-testid="kpi-bullet-card"
    >
      {/* Header: title (+ optional info tooltip) on the left,
          big number underneath. */}
      <div className="flex items-center gap-1">
        <h3 className="text-sm font-medium text-gray-700">{title}</h3>
        {tooltipContent && (
          <Tooltip content={tooltipContent}>
            <span
              aria-label="More info"
              role="img"
              className="inline-flex cursor-help"
            >
              <InfoIcon />
            </span>
          </Tooltip>
        )}
      </div>
      <p
        data-testid="kpi-value"
        className="mt-1 text-3xl font-bold text-gray-900"
      >
        {current.toLocaleString()}
      </p>

      {/* Inline rank line: #rank of N · percentile · region rank */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-gray-600">
        <Tooltip
          content={
            rankings.worldRank !== null
              ? "District's rank among all districts worldwide (1 = best)"
              : 'Ranking data unavailable - district may not have sufficient data for ranking'
          }
        >
          <span data-testid="world-rank">
            {rankings.worldRank !== null && rankings.totalDistricts > 0
              ? `#${rankings.worldRank} of ${rankings.totalDistricts}`
              : '—'}
          </span>
        </Tooltip>
        <span aria-hidden="true" className="text-gray-400">
          ·
        </span>
        <Tooltip
          content={
            rankings.worldPercentile !== null
              ? 'Percentage of districts this district outperforms worldwide'
              : 'Percentile data unavailable - requires world rank data'
          }
        >
          <span data-testid="world-percentile">
            {formatPercentile(rankings.worldPercentile)}
          </span>
        </Tooltip>
        {rankings.region && (
          <>
            <span aria-hidden="true" className="text-gray-400">
              ·
            </span>
            <RegionRankChip
              region={rankings.region}
              regionRank={rankings.regionRank}
            />
          </>
        )}
      </div>

      {/* Bullet bar OR fallback when targets unavailable */}
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
          className="mt-3 text-xs text-gray-500"
        >
          Targets unavailable
        </div>
      )}
    </div>
  )
}

export default KpiBulletCard
