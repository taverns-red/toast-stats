import { describe, it, expect } from 'vitest'
import { formatCompact, formatSignedCompact } from '../formatCompact'

describe('formatCompact (#2708)', () => {
  it('keeps small numbers whole and abbreviates thousands', () => {
    expect(formatCompact(888)).toBe('888')
    expect(formatCompact(8888)).toBe('8.9K')
    expect(formatCompact(12000)).toBe('12K')
    expect(formatCompact(-1200)).toBe('-1.2K')
  })

  it('signs with a true minus and leaves zero bare', () => {
    expect(formatSignedCompact(312)).toBe('+312')
    expect(formatSignedCompact(-1200)).toBe('−1.2K')
    expect(formatSignedCompact(0)).toBe('0')
  })
})
