/**
 * RecognitionBadge (#1361).
 *
 * The bug this replaces: all three competitive awards rendered the SAME `🏆`
 * emoji, and below 640px the distinguishing text was `sr-only`, so a district
 * that won two awards showed two identical gold chips with no way to tell them
 * apart and no key anywhere explaining what a trophy meant.
 *
 * The contract:
 *   - icon + short label at EVERY width (no `sr-only sm:not-sr-only`);
 *   - a unique accessible name carrying the FULL title, not just `title`;
 *   - the accent applied through the registry's CSS custom property, so
 *     colours live in one themed place rather than in Tailwind literals.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { RecognitionBadge } from '../RecognitionBadge'
import {
  AWARD_RECOGNITION,
  TIER_RECOGNITION,
  RECOGNITION_ITEMS,
} from '../recognitionRegistry'

const byId = (id: string) => RECOGNITION_ITEMS.find(i => i.id === id)!

describe('RecognitionBadge (#1361)', () => {
  it('exposes the full title as the accessible name', () => {
    render(<RecognitionBadge item={byId('extension')} />)
    expect(
      screen.getByRole('img', { name: "President's Extension Award" })
    ).toBeInTheDocument()
  })

  it('gives every registry item a UNIQUE accessible name', () => {
    render(
      <>
        {RECOGNITION_ITEMS.map(item => (
          <RecognitionBadge key={item.id} item={item} />
        ))}
      </>
    )
    const names = screen
      .getAllByRole('img')
      .map(el => el.getAttribute('aria-label'))
    expect(names).toHaveLength(RECOGNITION_ITEMS.length)
    expect(new Set(names).size).toBe(RECOGNITION_ITEMS.length)
  })

  it('shows the short label at every width — no sr-only treatment', () => {
    const { container } = render(<RecognitionBadge item={byId('twentyPlus')} />)
    const label = container.querySelector('.recognition-badge__label')
    expect(label).not.toBeNull()
    expect(label!.textContent).toBe('20-Plus')
    // The whole point: the label is not hidden below the compact breakpoint.
    expect(label!.className).not.toMatch(/sr-only/)
  })

  it('renders an inline SVG glyph, never an emoji', () => {
    for (const item of AWARD_RECOGNITION) {
      const { container, unmount } = render(<RecognitionBadge item={item} />)
      const svg = container.querySelector('svg')
      expect(svg).not.toBeNull()
      expect(svg!.getAttribute('stroke')).toBe('currentColor')
      expect(
        /\p{Extended_Pictographic}/u.test(container.textContent ?? '')
      ).toBe(false)
      unmount()
    }
  })

  it('applies the item accent as a CSS custom property', () => {
    const { container } = render(<RecognitionBadge item={byId('retention')} />)
    const badge = container.querySelector('.recognition-badge') as HTMLElement
    expect(badge.style.getPropertyValue('--recognition-accent')).toBe(
      'var(--recognition-retention)'
    )
  })

  it('tags tier badges with data-tier and keeps Smedley’s rare-tier hook (#546)', () => {
    const { container } = render(
      <>
        {TIER_RECOGNITION.map(t => (
          <RecognitionBadge key={t.id} item={t} />
        ))}
      </>
    )
    const badges = Array.from(
      container.querySelectorAll<HTMLElement>('.recognition-badge')
    )
    expect(badges.map(b => b.dataset.tier)).toEqual([
      'Distinguished',
      'Select',
      'Presidents',
      'Smedley',
    ])
    const rare = badges.filter(b =>
      b.className.includes('recognition-badge--rare')
    )
    expect(rare).toHaveLength(1)
    expect(rare[0].dataset.tier).toBe('Smedley')
  })

  it('accepts a testId and hides itself from AT when decorative', () => {
    const { container } = render(
      <RecognitionBadge
        item={byId('Select')}
        testId="tier-chip-61"
        decorative
      />
    )
    expect(screen.getByTestId('tier-chip-61')).toBeInTheDocument()
    // In the legend the adjacent prose carries the meaning, so the badge must
    // not announce it a second time.
    expect(screen.queryByRole('img')).toBeNull()
    expect(
      container.querySelector('.recognition-badge')?.getAttribute('aria-hidden')
    ).toBe('true')
  })
})
