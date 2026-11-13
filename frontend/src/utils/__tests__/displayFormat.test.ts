import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  signedDelta,
  signedPercent,
  formatPY,
  formatDistrict,
  districtAriaLabel,
} from '../displayFormat'
import { formatDateText } from '../dateFormatting'

/**
 * #2648 — one spelling per quantity. The Fable 5.2 review found the same
 * date, program year, signed number, region and district written many ways
 * on one screen; these are the shared spellings.
 */
describe('formatDateText', () => {
  it('long form: "Nov 11, 2026"', () => {
    expect(formatDateText('2026-11-11')).toBe('Nov 11, 2026')
    expect(formatDateText('2026-11-11', 'long')).toBe('Nov 11, 2026')
  })

  it('short form: "Nov 11"', () => {
    expect(formatDateText('2026-11-11', 'short')).toBe('Nov 11')
  })

  it('does not shift the day for users west of UTC', () => {
    expect(formatDateText('2026-01-01')).toBe('Jan 1, 2026')
  })

  describe('in a timezone behind UTC', () => {
    const original = process.env.TZ
    beforeAll(() => {
      process.env.TZ = 'America/New_York'
    })
    afterAll(() => {
      if (original === undefined) delete process.env.TZ
      else process.env.TZ = original
    })

    it('a UTC timestamp keeps its own calendar date', () => {
      // 01:00Z is still Nov 10 in New York; the date shown is the stamp's.
      expect(formatDateText('2026-11-11T01:00:00Z')).toBe('Nov 11, 2026')
    })
  })

  it('a full timestamp keeps its own calendar date, whatever the timezone', () => {
    expect(formatDateText('2026-11-11T23:30:00Z')).toBe('Nov 11, 2026')
    expect(formatDateText('2026-11-11T00:00:00')).toBe('Nov 11, 2026')
    expect(formatDateText('2026-11-11 08:00', 'short')).toBe('Nov 11')
  })

  it('an impossible date is passed through, never "Invalid Date"', () => {
    expect(formatDateText('2026-13-45')).toBe('2026-13-45')
  })

  it('leaves text that is already prose untouched', () => {
    expect(formatDateText('October 14, 2026')).toBe('October 14, 2026')
  })

  it('renders nothing for a missing date', () => {
    expect(formatDateText(undefined)).toBe('')
    expect(formatDateText(null)).toBe('')
  })
})

describe('formatPY', () => {
  it('long: "PY 2026–27" with an en dash', () => {
    expect(formatPY('2026-2027')).toBe('PY 2026–27')
    expect(formatPY('2026-27')).toBe('PY 2026–27')
    expect(formatPY('2026–2027')).toBe('PY 2026–27')
    expect(formatPY(2026)).toBe('PY 2026–27')
  })

  it('short: "PY 26–27"', () => {
    expect(formatPY('2026-2027', 'short')).toBe('PY 26–27')
    expect(formatPY(2026, 'short')).toBe('PY 26–27')
  })

  it('rolls the century correctly', () => {
    expect(formatPY(1999)).toBe('PY 1999–00')
  })

  it('never writes an ASCII hyphen', () => {
    expect(formatPY('2026-2027')).not.toContain('-')
  })

  it('returns an unparseable label unchanged', () => {
    expect(formatPY('unknown')).toBe('unknown')
  })
})

describe('signedDelta', () => {
  it('uses + for gains, U+2212 for losses and a bare 0', () => {
    expect(signedDelta(312)).toBe('+312')
    expect(signedDelta(-150)).toBe('−150')
    expect(signedDelta(0)).toBe('0')
  })

  it('groups thousands', () => {
    expect(signedDelta(2293)).toBe('+2,293')
    expect(signedDelta(-1676)).toBe('−1,676')
  })

  it('never writes an ASCII hyphen-minus', () => {
    expect(signedDelta(-558)).not.toContain('-')
  })

  it('a non-finite value reads as zero, never "−NaN"', () => {
    expect(signedDelta(NaN)).toBe('0')
    expect(signedDelta(undefined as unknown as number)).toBe('0')
    expect(signedDelta(Infinity, '±0')).toBe('±0')
  })

  it('lets a caller choose how zero reads', () => {
    expect(signedDelta(0, '±0')).toBe('±0')
  })
})

describe('signedPercent', () => {
  it('signs a percentage with U+2212 and one decimal', () => {
    expect(signedPercent(3.04)).toBe('+3.0%')
    expect(signedPercent(-2)).toBe('−2.0%')
    expect(signedPercent(0)).toBe('0.0%')
  })

  it('a non-finite value reads "0.0%", never "−NaN%"', () => {
    expect(signedPercent(NaN)).toBe('0.0%')
    expect(signedPercent(undefined as unknown as number)).toBe('0.0%')
  })

  it('a value that rounds to zero reads "0.0%" without a sign', () => {
    expect(signedPercent(-0.04)).toBe('0.0%')
    expect(signedPercent(0.04)).toBe('0.0%')
  })
})

describe('formatDistrict / districtAriaLabel', () => {
  it('link text is "D93", its accessible name "District 93"', () => {
    expect(formatDistrict('93')).toBe('D93')
    expect(formatDistrict('05')).toBe('D5')
    expect(districtAriaLabel('93')).toBe('District 93')
    expect(districtAriaLabel('05')).toBe('District 5')
  })

  it('names the undistricted bucket in words', () => {
    expect(formatDistrict('U')).toBe('Undistricted')
    expect(districtAriaLabel('U')).toBe('Undistricted')
  })

  it('a lettered district keeps its letter', () => {
    expect(formatDistrict('F')).toBe('DF')
    expect(districtAriaLabel('F')).toBe('District F')
  })
})
