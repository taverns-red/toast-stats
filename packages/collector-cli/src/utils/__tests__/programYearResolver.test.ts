import { describe, it, expect, vi } from 'vitest'
import {
  isValidDistrictSummaryCsv,
  parseDistrictIdsFromSummaryCsv,
  programYearFromCsvFooter,
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

describe('parseDistrictIdsFromSummaryCsv', () => {
  it('extracts sorted, de-duplicated district IDs from a real CSV', () => {
    const csv = `"REGION","DISTRICT","Paid Clubs"
"14","118","201"
"01","02","192"
"01","02","192"
"DNAR","U","37"`
    expect(parseDistrictIdsFromSummaryCsv(csv)).toEqual(['02', '118', 'U'])
  })

  it('returns [] for the HTML error page (no DISTRICT column) — never throws', () => {
    expect(parseDistrictIdsFromSummaryCsv(HTML_ERROR)).toEqual([])
  })

  it('returns [] for empty / header-only / nullish content', () => {
    expect(parseDistrictIdsFromSummaryCsv('')).toEqual([])
    expect(parseDistrictIdsFromSummaryCsv('"REGION","DISTRICT"')).toEqual([])
    expect(parseDistrictIdsFromSummaryCsv(undefined)).toEqual([])
  })
})

// Real captured header row from the 2026-2027 districtsummary CSV
// (downloaded from the dashboard 2026-07-31). Note "Region Advisor Visit" is
// GONE — TM retired the requirement for this program year (#1344) — and the
// footer reads "Month of Jul", which is what identifies the year (#1342).
const CSV_2026_27 = `"REGION","DISTRICT","DSP","Training","Market Analysis","Communication Plan","New Payments","April Payments","October Payments","Late Payments","Charter Payments","Total YTD Payments","Payment Base","% Payment Growth","Paid Club Base","Paid Clubs","% Club Growth","Active Clubs","Distinguished Clubs","Select Distinguished Clubs","Presidents Distinguished Clubs","Smedley Distinguished Clubs","Total Distinguished Clubs","% Distinguished Clubs"
"01","02","N","N","N","N","71","326","735","7","0","1139","6290","-81.89%","193","193","0%","203","0","0","0","0","0","0%"
Month of Jul, As of 07/30/2026`

describe('programYearFromCsvFooter (#1342)', () => {
  it('derives the program year from a July footer (new PY)', () => {
    expect(programYearFromCsvFooter(CSV_2026_27, '2026-07-30')).toBe(
      '2026-2027'
    )
  })

  it('derives the PRIOR program year from a June-close footer', () => {
    // "Month of Jun, As of 07/01/2026" — June belongs to PY 2025-2026 even
    // though it was collected in July. This is the rollover discriminator.
    expect(programYearFromCsvFooter(REAL_CSV, '2026-07-01')).toBe('2025-2026')
  })

  it('handles the December/January year boundary', () => {
    const csv = `"REGION","DISTRICT"\n"01","02"\nMonth of Dec, As of 01/05/2027`
    expect(programYearFromCsvFooter(csv, '2027-01-05')).toBe('2026-2027')
  })

  it('returns undefined when no footer is present (undecided, #1129)', () => {
    expect(
      programYearFromCsvFooter('"REGION","DISTRICT"\n"01","02"', '2026-07-30')
    ).toBeUndefined()
    expect(programYearFromCsvFooter(HTML_ERROR, '2026-07-30')).toBeUndefined()
  })
})

describe('resolveActiveProgramYear', () => {
  it('reads the LIVE endpoint and trusts its footer for the active year', async () => {
    const fetchSummary = vi.fn(async () => CSV_2026_27)
    const res = await resolveActiveProgramYear('2026-07-30', fetchSummary)

    expect(res.programYear).toBe('2026-2027')
    expect(res.pathStyle).toBe('live')
    expect(res.fellBack).toBe(false)
    expect(res.content).toBe(CSV_2026_27)
    expect(fetchSummary).toHaveBeenCalledTimes(1)
    expect(fetchSummary).toHaveBeenCalledWith('2026-2027', 'live')
  })

  // The rollover case, now decided by CONTENT rather than by probing a path
  // that may not exist. During Jul 1-29 2026 the live endpoint still served
  // June's close: one request, correctly labelled 2025-2026 instead of being
  // ingested as the new year.
  it('labels the live endpoint by its footer when TM has not rolled over yet', async () => {
    const fetchSummary = vi.fn(async () => REAL_CSV) // still June's close
    const res = await resolveActiveProgramYear('2026-07-15', fetchSummary)

    expect(res.programYear).toBe('2025-2026')
    expect(res.pathStyle).toBe('live')
    expect(res.fellBack).toBe(true)
    expect(fetchSummary).toHaveBeenCalledTimes(1)
  })

  it('falls back to the archive path when the live endpoint throws', async () => {
    const fetchSummary = vi.fn(
      async (py: string, pathStyle: 'live' | 'archive') => {
        if (pathStyle === 'live') throw new Error('HTTP 500')
        if (py === '2026-2027') return HTML_ERROR
        return REAL_CSV
      }
    )
    const res = await resolveActiveProgramYear('2026-07-01', fetchSummary)

    expect(res.programYear).toBe('2025-2026')
    expect(res.pathStyle).toBe('archive')
    expect(res.fellBack).toBe(true)
    expect(fetchSummary).toHaveBeenCalledWith('2025-2026', 'archive')
  })

  // The corruption guard: the root path IGNORES the ~{programYear} token and
  // serves whatever year is live, so a response must be rejected when its
  // footer disagrees with the year we asked for (#1342).
  it('rejects content whose footer disagrees with the requested year', async () => {
    const fetchSummary = vi.fn(
      async (_py: string, pathStyle: 'live' | 'archive') => {
        if (pathStyle === 'live') throw new Error('HTTP 500')
        return CSV_2026_27 // wrong year for every archive probe below
      }
    )
    // Calendar PY here is 2025-2026; the archive probes return 2026-2027 data.
    const res = await resolveActiveProgramYear('2026-06-15', fetchSummary)

    expect(res.content).toBeUndefined()
    expect(res.programYear).toBe('2025-2026')
    expect(res.fellBack).toBe(false)
  })

  it('returns the calendar year (no false fallback) when nothing validates', async () => {
    const fetchSummary = vi.fn(async () => HTML_ERROR)
    const res = await resolveActiveProgramYear('2026-07-01', fetchSummary)

    expect(res.programYear).toBe('2026-2027')
    expect(res.fellBack).toBe(false)
    expect(res.content).toBeUndefined()
  })
})
