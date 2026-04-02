import { describe, it, expect } from 'vitest'
import { parseClosingPeriodFromCsv } from '../csvFooterParser.js'

describe('parseClosingPeriodFromCsv', () => {
  it('detects no closing period for matched month', () => {
    const csv = `Club Number
Month of January, As of 01/08/2026`
    const result = parseClosingPeriodFromCsv(csv, '2026-01-08')
    expect(result.isClosingPeriod).toBe(false)
    expect(result.dataMonth).toBeUndefined()
  })

  it('detects closing period when data is previous month', () => {
    const csv = `Club Number
Month of March, As of 04/01/2026`
    const result = parseClosingPeriodFromCsv(csv, '2026-04-01')
    expect(result.isClosingPeriod).toBe(true)
    expect(result.dataMonth).toBe('2026-03')
  })

  it('detects cross-year closing period', () => {
    const csv = `Club Number
Month of December, As of 01/05/2026`
    const result = parseClosingPeriodFromCsv(csv, '2026-01-05')
    expect(result.isClosingPeriod).toBe(true)
    expect(result.dataMonth).toBe('2025-12')
  })

  it('returns false for corrupted footer', () => {
    const csv = `Club Number
Month of Nothing, As of 01/08/2026`
    const result = parseClosingPeriodFromCsv(csv, '2026-01-08')
    expect(result.isClosingPeriod).toBe(false)
  })
})
