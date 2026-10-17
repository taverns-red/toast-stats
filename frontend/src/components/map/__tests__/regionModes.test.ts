/**
 * The region map's colour modes (#1808): the district map's that apply
 * across districts, plus District; `?color=` is whitelisted at the parse.
 */
import { describe, it, expect } from 'vitest'
import { parseRegionColorMode, REGION_COLOR_MODES } from '../regionModes'

describe('REGION_COLOR_MODES', () => {
  it('offers the region-level modes, health first, District last', () => {
    expect(REGION_COLOR_MODES.map(m => m.id)).toEqual([
      'health',
      'tier',
      'status',
      'size',
      'growth',
      'dcp',
      'district',
    ])
  })
})

describe('parseRegionColorMode', () => {
  it('defaults to club health and rejects district-only or unknown modes', () => {
    expect(parseRegionColorMode(null)).toBe('health')
    expect(parseRegionColorMode('district')).toBe('district')
    expect(parseRegionColorMode('tier')).toBe('tier')
    expect(parseRegionColorMode('area')).toBe('health')
    expect(parseRegionColorMode('csp')).toBe('health')
    expect(parseRegionColorMode('x')).toBe('health')
  })
})
