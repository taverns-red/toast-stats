import { describe, it, expect } from 'vitest'
import type { ClubTrend } from '../../hooks/useDistrictAnalytics'
import {
  parseColorMode,
  getTileVisual,
  getLegendItems,
  GRID_COLOR_MODES,
} from '../clubGridColor'

/** Minimal ClubTrend factory — only the fields the grid colouring reads. */
function club(overrides: Partial<ClubTrend> = {}): ClubTrend {
  return {
    clubId: '1',
    clubName: 'Test Club',
    divisionId: 'A',
    divisionName: 'Division A',
    areaId: '1',
    areaName: 'Area 1',
    membershipTrend: [{ date: '2026-06-01', count: 20 }],
    dcpGoalsTrend: [{ date: '2026-06-01', goalsAchieved: 7 }],
    currentStatus: 'thriving',
    riskFactors: [],
    distinguishedLevel: 'Distinguished',
    ...overrides,
  } as ClubTrend
}

describe('parseColorMode (URL-seedable, clamps at parse — L124/144)', () => {
  it("returns 'tier' only for the exact string 'tier'", () => {
    expect(parseColorMode('tier')).toBe('tier')
  })

  it("defaults to 'health' for the explicit health value", () => {
    expect(parseColorMode('health')).toBe('health')
  })

  it.each([null, undefined, '', 'TIER', 'garbage', 'health ', '0', 'true'])(
    'clamps unknown/abusive value %p to health',
    raw => {
      expect(parseColorMode(raw)).toBe('health')
    }
  )

  it('exposes the canonical mode list', () => {
    expect([...GRID_COLOR_MODES]).toEqual(['health', 'tier'])
  })
})

describe('getTileVisual — health mode', () => {
  it('maps thriving to the thriving modifier + ✓ glyph + label', () => {
    const v = getTileVisual(club({ currentStatus: 'thriving' }), 'health')
    expect(v.modifierClass).toBe('club-grid-tile--thriving')
    expect(v.signalGlyph).toBe('✓')
    expect(v.statusLabel).toBe('Thriving')
  })

  it('maps vulnerable to the vulnerable modifier + ⚠ glyph', () => {
    const v = getTileVisual(club({ currentStatus: 'vulnerable' }), 'health')
    expect(v.modifierClass).toBe('club-grid-tile--vulnerable')
    expect(v.signalGlyph).toBe('⚠')
    expect(v.statusLabel).toBe('Vulnerable')
  })

  it('maps intervention-required to the intervention modifier + ✗ glyph', () => {
    const v = getTileVisual(
      club({ currentStatus: 'intervention-required' }),
      'health'
    )
    expect(v.modifierClass).toBe('club-grid-tile--intervention')
    expect(v.signalGlyph).toBe('✗')
    expect(v.statusLabel).toBe('Intervention Required')
  })

  it('renders DCP goals as the {n}/10 signal text, clamped to 0..10', () => {
    expect(
      getTileVisual(
        club({ dcpGoalsTrend: [{ date: '2026-06-01', goalsAchieved: 7 }] }),
        'health'
      ).signalText
    ).toBe('7/10')
    // out-of-range values are clamped (defensive, mirrors clubsColumns)
    expect(
      getTileVisual(
        club({ dcpGoalsTrend: [{ date: '2026-06-01', goalsAchieved: 13 }] }),
        'health'
      ).signalText
    ).toBe('10/10')
    expect(
      getTileVisual(club({ dcpGoalsTrend: [] }), 'health').signalText
    ).toBe('0/10')
  })
})

describe('getTileVisual — tier mode (per-club distinguishedLevel, NOT totals.* — L123)', () => {
  it.each([
    [
      'Distinguished',
      'club-grid-tile--tier-distinguished',
      'D',
      'Distinguished',
    ],
    ['Select', 'club-grid-tile--tier-select', 'S', 'Select'],
    ['President', 'club-grid-tile--tier-presidents', 'P', "President's"],
    ['Smedley', 'club-grid-tile--tier-smedley', 'M', 'Smedley'],
  ] as const)('%s → %s / %s / %s', (level, modifier, glyph, label) => {
    const v = getTileVisual(club({ distinguishedLevel: level }), 'tier')
    expect(v.modifierClass).toBe(modifier)
    expect(v.signalGlyph).toBe(glyph)
    expect(v.statusLabel).toBe(label)
  })

  it('NotDistinguished → neutral tier modifier + em-dash glyph', () => {
    const v = getTileVisual(
      club({ distinguishedLevel: 'NotDistinguished' }),
      'tier'
    )
    expect(v.modifierClass).toBe('club-grid-tile--tier-none')
    expect(v.signalGlyph).toBe('—')
    expect(v.statusLabel).toBe('Not yet Distinguished')
  })
})

describe('getLegendItems — single source shared with the tiles', () => {
  it('health legend lists the three health states + suspended, last', () => {
    const items = getLegendItems('health')
    expect(items.map(i => i.label)).toEqual([
      'Thriving',
      'Vulnerable',
      'Intervention Required',
      'Suspended',
    ])
    // swatch modifier matches the tile modifier the mapping produces
    expect(items[0].modifierClass).toBe('club-grid-tile--thriving')
  })

  it('tier legend lists tiers + not-yet + suspended, with matching modifiers', () => {
    const items = getLegendItems('tier')
    expect(items.map(i => i.modifierClass)).toEqual([
      'club-grid-tile--tier-presidents',
      'club-grid-tile--tier-select',
      'club-grid-tile--tier-distinguished',
      'club-grid-tile--tier-smedley',
      'club-grid-tile--tier-none',
      'club-grid-tile--suspended',
    ])
    // glyphs are the same single-letter codes the tiles render
    expect(items[0].glyph).toBe('P')
  })
})

describe('getTileVisual — suspended override (handled in BOTH modes)', () => {
  it.each(['health', 'tier'] as const)(
    'a suspended club gets the suspended modifier in %s mode',
    mode => {
      const v = getTileVisual(
        club({ clubStatus: 'Suspended', currentStatus: 'thriving' }),
        mode
      )
      expect(v.modifierClass).toBe('club-grid-tile--suspended')
      expect(v.statusLabel).toBe('Suspended')
      expect(v.signalGlyph).toBe('⊘')
    }
  )

  it('is case-insensitive on clubStatus', () => {
    expect(
      getTileVisual(club({ clubStatus: 'suspended' }), 'health').modifierClass
    ).toBe('club-grid-tile--suspended')
  })

  it('does not treat Active/Low/undefined as suspended', () => {
    for (const status of ['Active', 'Low', 'Ineligible', undefined]) {
      const v = getTileVisual(
        club({ clubStatus: status, currentStatus: 'thriving' }),
        'health'
      )
      expect(v.modifierClass).toBe('club-grid-tile--thriving')
    }
  })
})
