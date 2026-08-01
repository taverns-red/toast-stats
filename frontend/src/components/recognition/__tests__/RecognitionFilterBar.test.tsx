/**
 * Recognition chip row (#1362) — the toolbar control, isolated from the page.
 *
 * Reuses the region pill-bar pattern users already know: real `<button>`s, so
 * they inherit the 44px WCAG 2.5.5 floor from `styles/layers/base.css` and are
 * keyboard operable for free; `aria-pressed` carries the active state.
 *
 * Every chip is derived from the shared registry (#1361) — the labels, glyphs
 * and tier ordering have exactly one definition, so a filter chip can never
 * disagree with the badge it filters on.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { RecognitionFilterBar } from '../RecognitionFilterBar'
import {
  AWARD_RECOGNITION,
  TIER_RECOGNITION,
} from '../recognitionRegistry'
import { EMPTY_RECOGNITION_FILTER } from '../recognitionFilter'

const topTier = TIER_RECOGNITION.reduce((a, b) => (a.order > b.order ? a : b))

const renderBar = (
  filter = EMPTY_RECOGNITION_FILTER,
  onChange = vi.fn(),
  disabled = false
) => {
  const utils = render(
    <RecognitionFilterBar
      filter={filter}
      onChange={onChange}
      disabled={disabled}
    />
  )
  return { ...utils, onChange }
}

describe('RecognitionFilterBar — chips come from the registry', () => {
  it('renders one chip per award and one per tier, and nothing else', () => {
    renderBar()
    const row = screen.getByTestId('recognition-filter-row')
    const chips = within(row).getAllByRole('button')
    expect(chips).toHaveLength(
      AWARD_RECOGNITION.length + TIER_RECOGNITION.length
    )
  })

  it('labels each award chip with its registry short label and glyph', () => {
    renderBar()
    for (const award of AWARD_RECOGNITION) {
      const chip = screen.getByTestId(`recognition-filter-${award.id}`)
      expect(chip).toHaveTextContent(award.shortLabel)
      expect(chip.querySelector('svg')).not.toBeNull()
    }
  })

  it('names each tier chip as a THRESHOLD, not an exact match', () => {
    renderBar()
    for (const tier of TIER_RECOGNITION) {
      const chip = screen.getByTestId(`recognition-filter-tier-${tier.id}`)
      const name = chip.getAttribute('aria-label') ?? ''
      if (tier.id === topTier.id) {
        // The top of the ladder — "or higher" would name an empty set.
        expect(name).toContain(tier.title)
      } else {
        expect(name).toMatch(new RegExp(`${tier.title}.*or higher`, 'i'))
      }
    }
  })

  it('groups the awards and the tier ladder as separately labelled groups', () => {
    renderBar()
    // OR within a group, AND across groups — the grouping is the affordance
    // that makes that legible, so it has to reach assistive tech too.
    expect(
      screen.getByRole('group', { name: /award/i })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('group', { name: /tier/i })
    ).toBeInTheDocument()
  })
})

describe('RecognitionFilterBar — active state', () => {
  it('exposes the inactive state via aria-pressed=false on every chip', () => {
    renderBar()
    const row = screen.getByTestId('recognition-filter-row')
    for (const chip of within(row).getAllByRole('button')) {
      expect(chip).toHaveAttribute('aria-pressed', 'false')
    }
  })

  it('marks the selected award chips pressed and --active, and only those', () => {
    renderBar({ awards: ['extension', 'retention'], tier: null })

    const extension = screen.getByTestId('recognition-filter-extension')
    const retention = screen.getByTestId('recognition-filter-retention')
    const twentyPlus = screen.getByTestId('recognition-filter-twentyPlus')

    expect(extension).toHaveAttribute('aria-pressed', 'true')
    expect(retention).toHaveAttribute('aria-pressed', 'true')
    expect(twentyPlus).toHaveAttribute('aria-pressed', 'false')
    // Same `--active` treatment as the region chips (AC).
    expect(extension.className).toMatch(/--active\b/)
    expect(twentyPlus.className).not.toMatch(/--active\b/)
  })

  it('marks ONLY the threshold tier pressed — a >= filter is one choice', () => {
    renderBar({ awards: [], tier: 'Select' })
    expect(
      screen.getByTestId('recognition-filter-tier-Select')
    ).toHaveAttribute('aria-pressed', 'true')
    // Smedley clears the Select threshold, but the CHIP that is selected is
    // still Select — pressing every tier at or above it would read as four
    // independent selections.
    expect(
      screen.getByTestId('recognition-filter-tier-Smedley')
    ).toHaveAttribute('aria-pressed', 'false')
    expect(
      screen.getByTestId('recognition-filter-tier-Distinguished')
    ).toHaveAttribute('aria-pressed', 'false')
  })
})

describe('RecognitionFilterBar — interaction', () => {
  it('adds an award to the selection on click (OR group is multi-select)', () => {
    const { onChange } = renderBar({ awards: ['extension'], tier: null })
    fireEvent.click(screen.getByTestId('recognition-filter-retention'))
    expect(onChange).toHaveBeenCalledWith({
      awards: ['extension', 'retention'],
      tier: null,
    })
  })

  it('removes an already-selected award on click', () => {
    const { onChange } = renderBar({
      awards: ['extension', 'retention'],
      tier: null,
    })
    fireEvent.click(screen.getByTestId('recognition-filter-extension'))
    expect(onChange).toHaveBeenCalledWith({
      awards: ['retention'],
      tier: null,
    })
  })

  it('sets the tier threshold and leaves the award selection alone', () => {
    const { onChange } = renderBar({ awards: ['extension'], tier: null })
    fireEvent.click(screen.getByTestId('recognition-filter-tier-Presidents'))
    expect(onChange).toHaveBeenCalledWith({
      awards: ['extension'],
      tier: 'Presidents',
    })
  })

  it('replaces the threshold rather than accumulating tiers', () => {
    const { onChange } = renderBar({ awards: [], tier: 'Distinguished' })
    fireEvent.click(screen.getByTestId('recognition-filter-tier-Smedley'))
    expect(onChange).toHaveBeenCalledWith({ awards: [], tier: 'Smedley' })
  })

  it('clears the threshold when the active tier chip is clicked again', () => {
    const { onChange } = renderBar({ awards: [], tier: 'Select' })
    fireEvent.click(screen.getByTestId('recognition-filter-tier-Select'))
    expect(onChange).toHaveBeenCalledWith({ awards: [], tier: null })
  })

  it('is keyboard operable — the chips are real buttons', () => {
    renderBar()
    const row = screen.getByTestId('recognition-filter-row')
    for (const chip of within(row).getAllByRole('button')) {
      expect(chip.tagName).toBe('BUTTON')
      expect(chip).toHaveAttribute('type', 'button')
    }
  })
})

describe('RecognitionFilterBar — reserve mode (#1359 CLS)', () => {
  /**
   * The loading shell holds this row open with the SAME component, so the
   * reserve cannot drift from the thing it reserves for. It needs no data,
   * which is what makes an exact reserve possible here at all — unlike the
   * region row, whose chip count only becomes knowable when the data lands.
   */
  it('renders the identical chip set when disabled', () => {
    const { unmount } = renderBar()
    const live = within(screen.getByTestId('recognition-filter-row'))
      .getAllByRole('button')
      .map(b => b.textContent)
    unmount()

    renderBar(EMPTY_RECOGNITION_FILTER, vi.fn(), true)
    const reserved = within(screen.getByTestId('recognition-filter-row'))
      .getAllByRole('button')
      .map(b => b.textContent)
    expect(reserved).toEqual(live)
  })

  it('takes the chips out of the tab order and fires nothing', () => {
    const { onChange } = renderBar(EMPTY_RECOGNITION_FILTER, vi.fn(), true)
    const chips = within(
      screen.getByTestId('recognition-filter-row')
    ).getAllByRole('button')
    for (const chip of chips) expect(chip).toBeDisabled()
    fireEvent.click(chips[0])
    expect(onChange).not.toHaveBeenCalled()
  })
})
