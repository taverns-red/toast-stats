import { describe, it, expect, vi } from 'vitest'
import {
  isValidDistrictSummaryCsv,
  resolveActiveProgramYear,
} from '../programYearResolver.js'

// Real captured header row from a districtsummary CSV (2025-2026, 6/30/2026).
const REAL_CSV = `"REGION","DISTRICT","DSP","Training","Market Analysis","Communication Plan","Region Advisor Visit","New Payments","April Payments","October Payments","Late Payments","Charter Payments","Total YTD Payments","Payment Base","% Payment Growth","Paid Club Base","Paid Clubs","% Club Growth","Active Clubs","Distinguished Clubs","Select Distinguished Clubs","Presidents Distinguished Clubs","Smedley Distinguished Clubs","Total Distinguished Clubs","% Distinguished Clubs"
"01","02","Y","Y","Y","Y","Y","1134","2472","2553","10","114","6283","6851","-8.29%","212","192"
Month of Jun, As of 07/01/2026`

// Real captured body when a program year's dashboard is not yet published:
// TM 302-redirects to /error.aspx; fetch/curl follow it to a 200 HTML page.
const HTML_ERROR = `<html><head><title>Object moved</title></head><body>
<h2>Object moved to <a href="/error.aspx?aspxerrorpath=/2026-2027/export.aspx">here</a>.</h2>
</body></html>`

describe('isValidDistrictSummaryCsv', () => {
  it('accepts a real districtsummary CSV (header contains DISTRICT)', () => {
    expect(isValidDistrictSummaryCsv(REAL_CSV)).toBe(true)
  })

  it('rejects the HTML error page served for an unpublished program year', () => {
    expect(isValidDistrictSummaryCsv(HTML_ERROR)).toBe(false)
  })

  it('rejects empty / nullish content', () => {
    expect(isValidDistrictSummaryCsv('')).toBe(false)
    expect(isValidDistrictSummaryCsv(undefined)).toBe(false)
    expect(isValidDistrictSummaryCsv(null)).toBe(false)
  })
})

describe('resolveActiveProgramYear', () => {
  it('uses the calendar program year when its dashboard has data', async () => {
    const fetchSummary = vi.fn(async () => REAL_CSV)
    const res = await resolveActiveProgramYear('2026-01-15', fetchSummary)

    expect(res.programYear).toBe('2025-2026')
    expect(res.fellBack).toBe(false)
    expect(fetchSummary).toHaveBeenCalledTimes(1)
    expect(fetchSummary).toHaveBeenCalledWith('2025-2026')
  })

  it('falls back to the prior program year at the July rollover (#1284)', async () => {
    // 2026-07-01: calendar PY 2026-2027 not published (HTML error), June close
    // still live under prior PY 2025-2026.
    const fetchSummary = vi.fn(async (py: string) =>
      py === '2026-2027' ? HTML_ERROR : REAL_CSV
    )
    const res = await resolveActiveProgramYear('2026-07-01', fetchSummary)

    expect(res.programYear).toBe('2025-2026')
    expect(res.fellBack).toBe(true)
    expect(fetchSummary).toHaveBeenCalledWith('2026-2027')
    expect(fetchSummary).toHaveBeenCalledWith('2025-2026')
  })

  it('falls back when the calendar-year fetch throws', async () => {
    const fetchSummary = vi.fn(async (py: string) => {
      if (py === '2026-2027') throw new Error('HTTP 500')
      return REAL_CSV
    })
    const res = await resolveActiveProgramYear('2026-07-01', fetchSummary)

    expect(res.programYear).toBe('2025-2026')
    expect(res.fellBack).toBe(true)
  })

  it('self-heals: once the new year publishes, the calendar PY wins', async () => {
    const fetchSummary = vi.fn(async () => REAL_CSV) // new year now returns CSV
    const res = await resolveActiveProgramYear('2026-07-15', fetchSummary)

    expect(res.programYear).toBe('2026-2027')
    expect(res.fellBack).toBe(false)
    expect(fetchSummary).toHaveBeenCalledTimes(1)
  })

  it('returns the calendar year (no false fallback) when neither year validates', async () => {
    const fetchSummary = vi.fn(async () => HTML_ERROR)
    const res = await resolveActiveProgramYear('2026-07-01', fetchSummary)

    expect(res.programYear).toBe('2026-2027')
    expect(res.fellBack).toBe(false)
  })
})
