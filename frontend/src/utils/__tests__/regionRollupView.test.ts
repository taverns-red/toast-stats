/**
 * regionRollupView (#1815) — turns a region-rollups block (#1799) into the
 * panels, KPIs, breakdown rows and "Needs attention" rows the region and
 * world rollup pages render. Fixture: recorded prod 2026-10-15.
 *
 * Absent is not zero: a null figure stays null all the way to the view.
 */
import { describe, it, expect } from 'vitest'
import {
  RegionRollupsSchema,
  type RegionRollupFigures,
} from '@taverns-red/shared-contracts'
import recorded from '../../__tests__/fixtures/region-rollups-2026-10-15.recorded.json'
import {
  rollupKpis,
  rollupSections,
  regionBreakdown,
  worldBreakdown,
  needsAttention,
} from '../regionRollupView'

const rollups = RegionRollupsSchema.parse(recorded)
const world = rollups.world

function section(fig: RegionRollupFigures, id: string, snapshotDate: string) {
  const s = rollupSections(fig, {
    programYear: '2026-2027',
    snapshotDate,
  }).find(x => x.id === id)
  if (!s) throw new Error(`no ${id}`)
  return s
}

describe('rollupKpis', () => {
  it('reads clubs, membership, payments and distinguished clubs', () => {
    const k = rollupKpis(world)
    expect(k.clubs).toBe(14524)
    expect(k.membership).toBe(208939)
    expect(k.payments).toBe(292524)
    // Disjoint tiers: every club that is not "not distinguished".
    expect(k.distinguished).toBe(14524 - 13997)
  })
})

describe('rollupSections', () => {
  it('gives health counts with a share of the block’s clubs', () => {
    const h = section(world, 'health', '2026-10-15')
    expect(h.rows.map(r => [r.key, r.count])).toEqual([
      ['thriving', 2804],
      ['vulnerable', 5352],
      ['interventionRequired', 6368],
    ])
    expect(h.rows[0]!.share).toBeCloseTo(2804 / 14524)
  })

  it('lists club status, keeping Other only when it is non-zero', () => {
    const s = section(world, 'status', '2026-10-15')
    expect(s.rows.map(r => r.key)).toEqual([
      'active',
      'low',
      'ineligible',
      'suspended',
    ])
    const withOther = section(
      { ...world, clubStatus: { ...world.clubStatus, other: 3 } },
      'status',
      '2026-10-15'
    )
    expect(withOther.rows.map(r => r.key)).toContain('other')
  })

  it('keeps a null figure null — never 0 — with no share', () => {
    const fig: RegionRollupFigures = {
      ...world,
      compliance: { ...world.compliance, cspSubmitted: null },
      distinguished: { ...world.distinguished, smedley: null },
    }
    const c = section(fig, 'compliance', '2026-10-15')
    const csp = c.rows.find(r => r.key === 'cspSubmitted')!
    expect(csp.count).toBeNull()
    expect(csp.share).toBeNull()
    expect(csp.note).toBe('Not available')
    const d = section(fig, 'distinguished', '2026-10-15')
    expect(d.rows.find(r => r.key === 'smedley')!.count).toBeNull()
  })

  it('says April dues are not yet due before 1 January of the PY’s second year', () => {
    const before = section(world, 'compliance', '2026-10-15').rows.find(
      r => r.key === 'aprilDuesOnTime'
    )!
    expect(before.count).toBeNull()
    expect(before.note).toBe('Not yet due (April 2027)')
    const after = section(world, 'compliance', '2027-01-02').rows.find(
      r => r.key === 'aprilDuesOnTime'
    )!
    expect(after.count).toBe(69)
    expect(after.note).toBeNull()
  })

  it('has no share when the block has no clubs', () => {
    const empty: RegionRollupFigures = { ...world, clubs: 0 }
    expect(section(empty, 'health', '2026-10-15').rows[0]!.share).toBeNull()
  })
})

describe('regionBreakdown', () => {
  it('lists the region’s districts, each linking down to its district', () => {
    const rows = regionBreakdown(rollups, '07')
    expect(rows.map(r => r.id)).toEqual([
      '47',
      '84',
      '213',
      '217',
      '222',
      '223',
    ])
    expect(rows[0]!.to).toBe('/district/47')
    expect(rows[0]!.label).toBe('District 47')
    expect(rows[0]!.figures.clubs).toBe(rollups.districts['47']!.clubs)
  })

  it('is empty for an unknown region or when regions are unavailable', () => {
    expect(regionBreakdown(rollups, '99')).toEqual([])
    expect(regionBreakdown({ ...rollups, regions: null }, '07')).toEqual([])
  })
})

describe('worldBreakdown', () => {
  it('lists the 14 regions, each linking down to its rollup page', () => {
    const rows = worldBreakdown(rollups)
    expect(rows).toHaveLength(14)
    expect(rows[0]!.id).toBe('01')
    expect(rows[0]!.label).toBe('Region 01')
    expect(rows[0]!.to).toBe('/region/01/health')
  })

  it('is empty when regions are unavailable', () => {
    expect(worldBreakdown({ ...rollups, regions: null })).toEqual([])
  })
})

describe('needsAttention', () => {
  it('ranks children by intervention-required share, top three', () => {
    const rows = needsAttention(worldBreakdown(rollups))
    // 03: 563/1048, 01: 554/1040, 02: 550/1117 (recorded 2026-10-15).
    expect(rows.map(r => r.id)).toEqual(['03', '01', '02'])
    expect(rows[0]!.share).toBeCloseTo(563 / 1048)
  })

  it('skips children with no clubs', () => {
    const rows = needsAttention([
      {
        id: 'x',
        label: 'X',
        to: '/x',
        figures: { ...world, clubs: 0 },
      },
    ])
    expect(rows).toEqual([])
  })
})
