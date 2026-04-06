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

  it('detects closing period with abbreviated month name', () => {
    const csv = `Club Number
Month of Mar, As of 04/01/2026`
    const result = parseClosingPeriodFromCsv(csv, '2026-04-01')
    expect(result.isClosingPeriod).toBe(true)
    expect(result.dataMonth).toBe('2026-03')
  })

  it('detects no closing period with abbreviated month matching request', () => {
    const csv = `Club Number
Month of Jan, As of 01/15/2026`
    const result = parseClosingPeriodFromCsv(csv, '2026-01-15')
    expect(result.isClosingPeriod).toBe(false)
  })

  it('detects closing period for April 5 with March data', () => {
    // Exact reproduction of 2026-04-05 daily pipeline bug
    const csv = `"14","128","Y","Y","Y","Y","N","934","1480"\nMonth of Mar, As of 04/05/2026`
    const result = parseClosingPeriodFromCsv(csv, '2026-04-05')
    expect(result.isClosingPeriod).toBe(true)
    expect(result.dataMonth).toBe('2026-03')
  })

  it('returns false for corrupted footer', () => {
    const csv = `Club Number
Month of Nothing, As of 01/08/2026`
    const result = parseClosingPeriodFromCsv(csv, '2026-01-08')
    expect(result.isClosingPeriod).toBe(false)
  })
})
