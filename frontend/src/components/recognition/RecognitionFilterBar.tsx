import React from 'react'
import {
  AWARD_RECOGNITION,
  TIER_RECOGNITION,
  type AwardRecognitionId,
  type TierRecognitionId,
} from './recognitionRegistry'
import type { RecognitionFilterState } from './recognitionFilter'

/**
 * Recognition chip row (#1362) — the toolbar control that makes the #1361
 * badges actionable.
 *
 * Sits directly under the Regions row and reuses the region pill-bar pattern
 * users already know, down to the `--active` treatment. The chips are real
 * `<button>`s, which is what makes them keyboard operable and ≥44px (WCAG
 * 2.5.5) without re-implementing either: `styles/layers/base.css` floors every
 * button at 44×44.
 *
 * Two groups, two behaviours, matching the filter semantics:
 *   - **Awards** are a multi-select (OR) — a district needs any one of them.
 *   - **Tiers** are a single `>=` THRESHOLD, so selecting one replaces the
 *     other rather than accumulating. Pressing four ordinal chips would read
 *     as four independent selections and misdescribe the filter.
 *
 * Everything renders from the shared registry, so a filter chip can never
 * disagree with the badge it filters on. The tier chips' `+` suffix is derived
 * from `order` (the top of the ladder has nothing above it), not a hardcoded
 * exception.
 */
export interface RecognitionFilterBarProps {
  filter: RecognitionFilterState
  onChange: (next: RecognitionFilterState) => void
  /**
   * Reserve mode for the loading shell. The row is part of the loaded tree, so
   * an unreserved slot would reintroduce the #1359 shift the last two PRs
   * removed; the shell holds it open with THIS component (it needs no data),
   * so the reserve cannot drift from the thing it reserves for. Disabled
   * rather than merely `aria-hidden`, so the placeholder is not a tab stop.
   */
  disabled?: boolean
}

const TOP_TIER_ORDER = TIER_RECOGNITION.reduce(
  (max, t) => Math.max(max, t.order),
  0
)

export const RecognitionFilterBar: React.FC<RecognitionFilterBarProps> = ({
  filter,
  onChange,
  disabled = false,
}) => {
  const chipClass = (active: boolean) =>
    'districts-toolbar__recognition-chip' +
    (active ? ' districts-toolbar__recognition-chip--active' : '')

  const toggleAward = (id: AwardRecognitionId) => {
    const selected = filter.awards.includes(id)
    onChange({
      ...filter,
      // Preserve registry order so the state — and therefore the URL — is
      // canonical no matter which chip the user clicked first.
      awards: AWARD_RECOGNITION.map(a => a.id).filter(candidate =>
        candidate === id ? !selected : filter.awards.includes(candidate)
      ),
    })
  }

  const toggleTier = (id: TierRecognitionId) => {
    onChange({ ...filter, tier: filter.tier === id ? null : id })
  }

  return (
    <div
      className="districts-toolbar__row"
      data-testid="recognition-filter-row"
    >
      <span className="districts-toolbar__label">Recognition:</span>

      <span
        className="districts-toolbar__chip-group"
        role="group"
        aria-label="Filter by competitive award"
      >
        {AWARD_RECOGNITION.map(award => {
          const active = filter.awards.includes(award.id)
          const { Icon } = award
          return (
            <button
              key={award.id}
              type="button"
              data-testid={`recognition-filter-${award.id}`}
              className={chipClass(active)}
              aria-pressed={active}
              aria-label={award.title}
              title={award.description}
              disabled={disabled}
              onClick={() => toggleAward(award.id)}
              // The accent matches the badge this chip filters on, so the
              // control and the thing it selects read as the same object.
              style={
                {
                  '--recognition-accent': `var(${award.accentVar})`,
                } as React.CSSProperties
              }
            >
              <Icon className="districts-toolbar__recognition-chip-icon" />
              {award.shortLabel}
            </button>
          )
        })}
      </span>

      <span
        className="districts-toolbar__chip-group"
        role="group"
        aria-label="Filter by Distinguished tier"
      >
        {TIER_RECOGNITION.map(tier => {
          const active = filter.tier === tier.id
          const isTop = tier.order === TOP_TIER_ORDER
          const { Icon } = tier
          return (
            <button
              key={tier.id}
              type="button"
              data-testid={`recognition-filter-tier-${tier.id}`}
              className={chipClass(active)}
              aria-pressed={active}
              aria-label={isTop ? tier.title : `${tier.title} or higher`}
              title={
                isTop
                  ? `${tier.title} — the top of the ladder`
                  : `${tier.title} or higher`
              }
              disabled={disabled}
              onClick={() => toggleTier(tier.id)}
              style={
                {
                  '--recognition-accent': `var(${tier.accentVar})`,
                } as React.CSSProperties
              }
            >
              <Icon className="districts-toolbar__recognition-chip-icon" />
              {isTop ? tier.shortLabel : `${tier.shortLabel}+`}
            </button>
          )
        })}
      </span>
    </div>
  )
}

export default RecognitionFilterBar
