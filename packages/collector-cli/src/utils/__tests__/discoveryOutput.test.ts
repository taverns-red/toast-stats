import { describe, it, expect } from 'vitest'
import { buildDiscoveryOutput } from '../discoveryOutput.js'
import type { ProgramYearResolution } from '../programYearResolver.js'

const resolution: ProgramYearResolution = {
  programYear: '2025-2026',
  reason: 'upstream-error',
  pathStyle: 'archive',
  fellBack: true,
}

describe('buildDiscoveryOutput (#1343)', () => {
  // The pipeline reads these with jq. A missing key degrades to "unknown"
  // rather than failing, so the contract is pinned by name.
  it('emits every field the daily pipeline parses', () => {
    const out = buildDiscoveryOutput('2026-07-28', resolution, ['01', '02'])

    expect(Object.keys(out).sort()).toEqual([
      'count',
      'date',
      'districts',
      'fellBack',
      'programYear',
      'reason',
    ])
  })

  it('carries the resolver verdict through verbatim', () => {
    const out = buildDiscoveryOutput('2026-07-28', resolution, ['01', '02'])

    expect(out.reason).toBe('upstream-error')
    expect(out.programYear).toBe('2025-2026')
    expect(out.fellBack).toBe(true)
    expect(out.districts).toBe('01,02')
    expect(out.count).toBe(2)
  })

  // The no-districts exit path is the one that almost shipped without
  // `reason`; it must be identical in shape to the success path.
  it('keeps the same shape when no districts were discovered', () => {
    const out = buildDiscoveryOutput('2026-07-28', resolution, [])

    expect(out.districts).toBe('')
    expect(out.count).toBe(0)
    expect(out.reason).toBe('upstream-error')
  })
})
