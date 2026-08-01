/**
 * Recognition registry (#1361).
 *
 * The vocabulary used to be described three times — `AWARD_CARDS` in
 * `AwardsRaceSection`, `TIER_CONFIG` in `DistrictTierChip`, and three inline
 * `🏆` chips in `DistrictsPage`. These lock the properties that make a single
 * registry worth having: one entry per item, distinct glyphs where the items
 * are independent, a SHARED glyph where they are ordinal, and enough keys on
 * each entry that a consumer never needs a second list.
 *
 * #1362 builds badge filtering on this module, so the shape is load-bearing.
 */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  AWARD_RECOGNITION,
  TIER_RECOGNITION,
  RECOGNITION_ITEMS,
  tierRecognition,
} from '../recognitionRegistry'

const render = (Icon: React.FC<{ className?: string }>) =>
  renderToStaticMarkup(<Icon />)

describe('recognition registry (#1361)', () => {
  it('covers the three competitive awards and the four Distinguished tiers', () => {
    expect(AWARD_RECOGNITION.map(a => a.id)).toEqual([
      'extension',
      'twentyPlus',
      'retention',
    ])
    expect(TIER_RECOGNITION.map(t => t.id)).toEqual([
      'Distinguished',
      'Select',
      'Presidents',
      'Smedley',
    ])
    expect(RECOGNITION_ITEMS).toHaveLength(7)
  })

  it('gives every item a title, a short label, a description and an accent', () => {
    for (const item of RECOGNITION_ITEMS) {
      expect(item.title.length).toBeGreaterThan(0)
      expect(item.shortLabel.length).toBeGreaterThan(0)
      expect(item.description.length).toBeGreaterThan(0)
      expect(item.accentVar).toMatch(/^--recognition-/)
    }
  })

  it('gives every item a DISTINCT accent', () => {
    const accents = RECOGNITION_ITEMS.map(i => i.accentVar)
    expect(new Set(accents).size).toBe(accents.length)
  })

  it('gives each independent award its own glyph', () => {
    const glyphs = AWARD_RECOGNITION.map(a => render(a.Icon))
    expect(new Set(glyphs).size).toBe(3)
  })

  it('shares ONE rosette across the ordinal tiers', () => {
    // The tiers differ in degree, not in kind — four glyphs would assert a
    // difference the data does not have. Colour + label carry the degree.
    const glyphs = TIER_RECOGNITION.map(t => render(t.Icon))
    expect(new Set(glyphs).size).toBe(1)
    expect(TIER_RECOGNITION.map(t => t.order)).toEqual([1, 2, 3, 4])
  })

  it('draws every glyph with stroke="currentColor" — not emoji', () => {
    for (const item of RECOGNITION_ITEMS) {
      const svg = render(item.Icon)
      expect(svg).toContain('<svg')
      expect(svg).toContain('stroke="currentColor"')
      expect(svg).toContain('aria-hidden="true"')
      // No emoji anywhere in the registry's presentation.
      expect(/\p{Extended_Pictographic}/u.test(svg)).toBe(false)
      expect(/\p{Extended_Pictographic}/u.test(item.shortLabel)).toBe(false)
      expect(/\p{Extended_Pictographic}/u.test(item.title)).toBe(false)
    }
  })

  it('marks Smedley — and only Smedley — as the rare tier (#546)', () => {
    expect(TIER_RECOGNITION.filter(t => t.rare).map(t => t.id)).toEqual([
      'Smedley',
    ])
  })

  it('carries the CDN keys each award needs, so consumers need no second list', () => {
    expect(
      AWARD_RECOGNITION.map(a => [a.winnerFlagKey, a.standingsKey])
    ).toEqual([
      ['extensionIsWinner', 'extensionAward'],
      ['twentyPlusIsWinner', 'twentyPlusAward'],
      ['retentionIsWinner', 'retentionAward'],
    ])
    // The Awards Race card's own vocabulary lives here too, so AwardsRaceSection
    // is a consumer rather than a fourth description.
    for (const a of AWARD_RECOGNITION) {
      expect(a.threshold.length).toBeGreaterThan(0)
      expect(typeof a.formatValue(1)).toBe('string')
      expect(a.computeProgress(1)).toBeGreaterThanOrEqual(0)
      expect(a.computeProgress(1e6)).toBeLessThanOrEqual(100)
    }
  })

  describe('tierRecognition()', () => {
    it('resolves an achieved tier to its entry', () => {
      expect(tierRecognition('Smedley')?.shortLabel).toBe('Smedley')
      expect(tierRecognition('Presidents')?.shortLabel).toBe("President's")
    })

    it('treats absence, NotDistinguished and Unknown alike (absence = signal)', () => {
      expect(tierRecognition(null)).toBeUndefined()
      expect(tierRecognition(undefined)).toBeUndefined()
      expect(tierRecognition('NotDistinguished')).toBeUndefined()
      expect(tierRecognition('Unknown')).toBeUndefined()
    })
  })
})
