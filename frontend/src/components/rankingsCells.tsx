/**
 * Cell renderers for the landing rankings table (#2689). Components only, so
 * the column model in `rankingsColumns.tsx` stays a plain module.
 *
 * The district cell is the row header: it holds the my-district star, the
 * district link (the row's only action, there is no whole-row click), the
 * recognition badges and the region suffix. "Your district" is visible text,
 * never colour alone.
 */

import React from 'react'
import { Link } from 'react-router-dom'
import DistrictTierChip from './DistrictTierChip'
import { DistrictChipAndName } from './DistrictChipAndName'
import { RecognitionBadge } from './recognition/RecognitionBadge'
import {
  AWARD_RECOGNITION,
  CLUB_GROWTH_RECOGNITION,
} from './recognition/recognitionRegistry'
import type { RankedDistrict, RankingsTableMeta } from './rankingsTableFeatures'
import { formatNumber, formatPercentage } from '../utils/rankingsFormat'

const STAR_PATH =
  'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z'

export const DistrictCell: React.FC<{
  district: RankedDistrict
  meta: RankingsTableMeta
}> = ({ district, meta }) => {
  const id = district.districtId
  const isMine = meta.isMyDistrict(id)
  const rawTier =
    meta.competitiveAwards?.distinguishedDistrict?.[id]?.currentTier ?? null
  // Absence is the signal for "no tier achieved", same convention as the chip.
  const tier = rawTier && rawTier !== 'NotDistinguished' ? rawTier : null
  const held = meta.clubGrowthHeld.get(id)
  return (
    <div className="rankings-district">
      <button
        type="button"
        onClick={() => meta.setMyDistrict(isMine ? null : id)}
        aria-label={
          isMine
            ? `Unset District ${id} as my district`
            : `Set District ${id} as my district`
        }
        aria-pressed={isMine}
        title={
          isMine
            ? 'Click to clear · this district pins to top across visits'
            : 'Click to mark as my district · pins to top across visits'
        }
        className="districts-rankings-table__touch-btn rankings-star"
      >
        <svg
          className="w-4 h-4"
          fill={isMine ? 'currentColor' : 'none'}
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d={STAR_PATH}
          />
        </svg>
      </button>
      <Link to={`/district/${id}`} className="rankings-district__link">
        <DistrictChipAndName
          districtId={id}
          name={district.districtName}
          nameClassName="rankings-district__name"
        />
      </Link>
      {isMine && <span className="rankings-district__mine">Your district</span>}
      {/* Recognition (#1361): the Distinguished tier and the competitive
          awards answer the same question, what has this district earned?
          Driven by the shared registry. */}
      <DistrictTierChip districtId={id} tier={tier} />
      {AWARD_RECOGNITION.map(award =>
        meta.competitiveAwards?.byDistrict?.[id]?.[award.winnerFlagKey] ? (
          <RecognitionBadge
            key={award.id}
            item={award}
            testId={`recognition-${award.id}-${id}`}
          />
        ) : null
      )}
      {held ? (
        <RecognitionBadge
          item={CLUB_GROWTH_RECOGNITION}
          detail={String(held.milestone)}
          detailDescription={held.description}
          testId={`recognition-${CLUB_GROWTH_RECOGNITION.id}-${id}`}
        />
      ) : null}
      {district.region && (
        <span
          data-testid={`district-region-suffix-${id}`}
          className="rankings-muted"
        >
          · R{district.region}
        </span>
      )}
    </div>
  )
}

export const Metric: React.FC<{ value: number; rank: number; pct: number }> = ({
  value,
  rank,
  pct,
}) => {
  const growth = formatPercentage(pct)
  return (
    <div className="rankings-metric">
      <div className="rankings-metric__value">{formatNumber(value)}</div>
      <div className="rankings-metric__sub">
        <span className="rankings-metric__rank text-tm-loyal-blue">
          #{rank}
        </span>
        <span aria-hidden="true" className="text-gray-400">
          •
        </span>
        <span className={growth.color}>{growth.text}</span>
      </div>
    </div>
  )
}
