import React from 'react'
import type { RecognitionItem } from './recognitionRegistry'

/**
 * One recognition badge (#1361) — icon + short label, at every width.
 *
 * Replaces three identical `🏆` chips whose only distinguishing text was
 * `sr-only` below 640px. A badge is now self-describing on a phone, and the
 * glyph carries the per-item accent.
 *
 * Accessibility: `role="img"` + `aria-label` gives the badge a real accessible
 * name (the FULL title) and hides its decorative innards from AT. A bare
 * `aria-label` on a generic `<span>` is unreliable — most screen readers
 * ignore it on elements with no role — which is why the old chip's `title`
 * attribute alone was not enough.
 */
export interface RecognitionBadgeProps {
  item: RecognitionItem
  /** Stable hook for tests / CSS. */
  testId?: string
  /**
   * Legend usage: adjacent prose already carries the meaning, so the badge
   * must not announce it a second time.
   */
  decorative?: boolean
}

export const RecognitionBadge: React.FC<RecognitionBadgeProps> = ({
  item,
  testId,
  decorative = false,
}) => {
  const { Icon } = item
  return (
    <span
      data-testid={testId}
      data-recognition={item.id}
      data-tier={item.kind === 'tier' ? item.id : undefined}
      className={
        'recognition-badge' +
        (item.kind === 'tier' && item.rare ? ' recognition-badge--rare' : '')
      }
      // The accent is a custom property rather than a Tailwind literal so the
      // value can remap per theme in one place (tokens/redesign.css).
      style={
        {
          '--recognition-accent': `var(${item.accentVar})`,
        } as React.CSSProperties
      }
      title={item.title}
      {...(decorative
        ? { 'aria-hidden': true as const }
        : { role: 'img', 'aria-label': item.title })}
    >
      <Icon className="recognition-badge__icon" />
      <span className="recognition-badge__label">{item.shortLabel}</span>
    </span>
  )
}

export default RecognitionBadge
