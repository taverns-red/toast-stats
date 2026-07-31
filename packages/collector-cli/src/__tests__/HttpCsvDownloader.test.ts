/**
 * Unit Tests for HttpCsvDownloader (#123)
 *
 * Tests URL construction for all 4 report types and rate limiter behavior.
 */

import { describe, it, expect } from 'vitest'
import {
  HttpCsvDownloader,
  buildExportUrl,
  computeMonthEndDate,
  parseClosingPeriodFromCsv,
  type BackfillDateSpec,
} from '../services/HttpCsvDownloader.js'

describe('HttpCsvDownloader URL Construction (#123)', () => {
  describe('buildExportUrl', () => {
    it('should construct districtsummary URL without monthEndDate (legacy)', () => {
      const url = buildExportUrl({
        programYear: '2024-2025',
        reportType: 'districtsummary',
        date: new Date(2025, 5, 30), // June 30, 2025
      })

      expect(url).toBe(
        'https://dashboards.toastmasters.org/2024-2025/export.aspx?type=CSV&report=districtsummary~~6/30/2025~2024-2025'
      )
    })

    // #1342 — TM moved the live program year to the bare /export.aspx path.
    // /{PY}/export.aspx now 500s ("URL Rewrite Module Error.") for the live
    // year and serves ARCHIVED years only. Verified against the dashboard
    // 2026-07-31; the working URL was captured from the browser's own export.
    describe('program-year path style (#1342)', () => {
      it('omits the /{programYear}/ prefix for the LIVE program year', () => {
        const url = buildExportUrl({
          programYear: '2026-2027',
          reportType: 'districtsummary',
          date: new Date(2026, 6, 30), // July 30, 2026
          pathStyle: 'live',
        })

        expect(url).toBe(
          'https://dashboards.toastmasters.org/export.aspx?type=CSV&report=districtsummary~~7/30/2026~2026-2027'
        )
      })

      it('keeps the /{programYear}/ prefix for an ARCHIVED program year', () => {
        const url = buildExportUrl({
          programYear: '2025-2026',
          reportType: 'districtsummary',
          date: new Date(2026, 5, 30), // June 30, 2026
          pathStyle: 'archive',
        })

        expect(url).toBe(
          'https://dashboards.toastmasters.org/2025-2026/export.aspx?type=CSV&report=districtsummary~~6/30/2026~2025-2026'
        )
      })

      // The default MUST stay 'archive': every historical caller
      // (BackfillOrchestrator, rescrape-historical, backfill-raw-csv-for-dates)
      // relies on the prefix to pin the year. The root path ignores the
      // ~{programYear} token and would silently return CURRENT-year data.
      it('defaults to the archive path when pathStyle is omitted', () => {
        const url = buildExportUrl({
          programYear: '2019-2020',
          reportType: 'clubperformance',
          districtId: '61',
          date: new Date(2020, 0, 15),
        })

        expect(url).toBe(
          'https://dashboards.toastmasters.org/2019-2020/export.aspx?type=CSV&report=clubperformance~61~~1/15/2020~2019-2020'
        )
      })

      it('applies the live path to per-district reports too', () => {
        const url = buildExportUrl({
          programYear: '2026-2027',
          reportType: 'clubperformance',
          districtId: '61',
          date: new Date(2026, 6, 30),
          pathStyle: 'live',
        })

        expect(url).toBe(
          'https://dashboards.toastmasters.org/export.aspx?type=CSV&report=clubperformance~61~~7/30/2026~2026-2027'
        )
      })
    })

    it('should construct districtsummary URL with monthEndDate (#204)', () => {
      const url = buildExportUrl({
        programYear: '2024-2025',
        reportType: 'districtsummary',
        date: new Date(2025, 5, 30),
        monthEndDate: new Date(2025, 4, 31), // May 31, 2025
      })

      expect(url).toBe(
        'https://dashboards.toastmasters.org/2024-2025/export.aspx?type=CSV&report=districtsummary~5/31/2025~6/30/2025~2024-2025'
      )
    })

    it('should construct clubperformance URL with monthEndDate (#204)', () => {
      const url = buildExportUrl({
        programYear: '2025-2026',
        reportType: 'clubperformance',
        districtId: '61',
        date: new Date(2025, 8, 8), // Sep 8, 2025
        monthEndDate: new Date(2025, 7, 31), // Aug 31, 2025
      })

      expect(url).toBe(
        'https://dashboards.toastmasters.org/2025-2026/export.aspx?type=CSV&report=clubperformance~61~8/31/2025~9/8/2025~2025-2026'
      )
    })

    it('should construct districtperformance URL with district ID', () => {
      const url = buildExportUrl({
        programYear: '2024-2025',
        reportType: 'districtperformance',
        districtId: '109',
        date: new Date(2025, 5, 30),
      })

      expect(url).toBe(
        'https://dashboards.toastmasters.org/2024-2025/export.aspx?type=CSV&report=districtperformance~109~~6/30/2025~2024-2025'
      )
    })

    it('should construct divisionperformance URL with district ID', () => {
      const url = buildExportUrl({
        programYear: '2024-2025',
        reportType: 'divisionperformance',
        districtId: '109',
        date: new Date(2025, 5, 30),
      })

      expect(url).toBe(
        'https://dashboards.toastmasters.org/2024-2025/export.aspx?type=CSV&report=divisionperformance~109~~6/30/2025~2024-2025'
      )
    })

    it('should construct clubperformance URL with district ID', () => {
      const url = buildExportUrl({
        programYear: '2024-2025',
        reportType: 'clubperformance',
        districtId: '109',
        date: new Date(2025, 5, 30),
      })

      expect(url).toBe(
        'https://dashboards.toastmasters.org/2024-2025/export.aspx?type=CSV&report=clubperformance~109~~6/30/2025~2024-2025'
      )
    })

    it('should format date as M/D/YYYY (no zero padding)', () => {
      const url = buildExportUrl({
        programYear: '2017-2018',
        reportType: 'districtsummary',
        date: new Date(2018, 0, 5), // January 5, 2018
      })

      expect(url).toContain('report=districtsummary~~1/5/2018~2017-2018')
    })

    it('should use older program year for older dates', () => {
      const url = buildExportUrl({
        programYear: '2017-2018',
        reportType: 'districtperformance',
        districtId: '61',
        date: new Date(2017, 11, 15), // December 15, 2017
      })

      expect(url).toBe(
        'https://dashboards.toastmasters.org/2017-2018/export.aspx?type=CSV&report=districtperformance~61~~12/15/2017~2017-2018'
      )
    })
  })

  describe('computeMonthEndDate (#204)', () => {
    it('should return last day of previous month', () => {
      // Sep 8 -> Aug 31
      const result = computeMonthEndDate(new Date(2025, 8, 8))
      expect(result.getFullYear()).toBe(2025)
      expect(result.getMonth()).toBe(7) // August
      expect(result.getDate()).toBe(31)
    })

    it('should handle January (returns Dec 31 of previous year)', () => {
      // Jan 8, 2026 -> Dec 31, 2025
      const result = computeMonthEndDate(new Date(2026, 0, 8))
      expect(result.getFullYear()).toBe(2025)
      expect(result.getMonth()).toBe(11) // December
      expect(result.getDate()).toBe(31)
    })

    it('should handle Feb -> Jan 31', () => {
      // Feb 13, 2026 -> Jan 31, 2026
      const result = computeMonthEndDate(new Date(2026, 1, 13))
      expect(result.getFullYear()).toBe(2026)
      expect(result.getMonth()).toBe(0) // January
      expect(result.getDate()).toBe(31)
    })

    it('should handle March -> Feb 28 (non-leap year)', () => {
      // Mar 18, 2026 -> Feb 28, 2026
      const result = computeMonthEndDate(new Date(2026, 2, 18))
      expect(result.getFullYear()).toBe(2026)
      expect(result.getMonth()).toBe(1) // February
      expect(result.getDate()).toBe(28)
    })

    it('should handle March -> Feb 29 (leap year)', () => {
      // Mar 18, 2028 -> Feb 29, 2028
      const result = computeMonthEndDate(new Date(2028, 2, 18))
      expect(result.getFullYear()).toBe(2028)
      expect(result.getMonth()).toBe(1) // February
      expect(result.getDate()).toBe(29)
    })
  })

  describe('generateDateGrid', () => {
    it('should generate biweekly dates across a full program year', () => {
      const downloader = new HttpCsvDownloader({ ratePerSecond: 1 })
      const dates = downloader.generateDateGrid('2024-2025', 'biweekly')

      // July 1, 2024 to June 30, 2025 = ~365 days, biweekly = ~26 dates
      expect(dates.length).toBeGreaterThanOrEqual(24)
      expect(dates.length).toBeLessThanOrEqual(28)

      // First date should be in July 2024
      expect(dates[0]!.getMonth()).toBe(6) // July (0-indexed)
      expect(dates[0]!.getFullYear()).toBe(2024)

      // Last date should always be June 30
      const lastDate = dates[dates.length - 1]!
      expect(lastDate.getMonth()).toBe(5) // June
      expect(lastDate.getDate()).toBe(30)
      expect(lastDate.getFullYear()).toBe(2025)
    })

    it('should generate weekly dates', () => {
      const downloader = new HttpCsvDownloader({ ratePerSecond: 1 })
      const dates = downloader.generateDateGrid('2024-2025', 'weekly')

      expect(dates.length).toBeGreaterThanOrEqual(50)
      expect(dates.length).toBeLessThanOrEqual(54)
    })

    it('should generate monthly dates', () => {
      const downloader = new HttpCsvDownloader({ ratePerSecond: 1 })
      const dates = downloader.generateDateGrid('2024-2025', 'monthly')

      // 12 months (~30-day intervals) + year-end date
      expect(dates.length).toBeGreaterThanOrEqual(12)
      expect(dates.length).toBeLessThanOrEqual(15)
    })
  })

  describe('programYearRange', () => {
    it('should generate program year strings for a range', () => {
      const downloader = new HttpCsvDownloader({ ratePerSecond: 1 })
      const years = downloader.getProgramYearRange(2017, 2024)

      expect(years).toEqual([
        '2017-2018',
        '2018-2019',
        '2019-2020',
        '2020-2021',
        '2021-2022',
        '2022-2023',
        '2023-2024',
        '2024-2025',
      ])
    })

    it('should handle single year', () => {
      const downloader = new HttpCsvDownloader({ ratePerSecond: 1 })
      const years = downloader.getProgramYearRange(2024, 2024)

      expect(years).toEqual(['2024-2025'])
    })
  })

  describe('parseDistrictsFromSummary', () => {
    it('should extract district IDs from summary CSV', () => {
      const csv = `"REGION","DISTRICT","DSP","Training"
"01","02","Y","Y"
"01","09","Y","Y"
"02","F","Y","Y"
"03","42","Y","Y"
`
      const downloader = new HttpCsvDownloader({ ratePerSecond: 1 })
      const districts = downloader.parseDistrictsFromSummary(csv)

      // Numeric IDs sort first, then alphabetic
      expect(districts).toEqual(['02', '09', '42', 'F'])
    })

    it('should return empty array for empty CSV', () => {
      const downloader = new HttpCsvDownloader({ ratePerSecond: 1 })
      const districts = downloader.parseDistrictsFromSummary('')

      expect(districts).toEqual([])
    })

    it('should filter out "As of" date rows and non-alphanumeric district IDs (#145)', () => {
      const csv = `"REGION","DISTRICT","DSP","Training"
"01","02","Y","Y"
"01","109","Y","Y"
"02","F","Y","Y"
"02","U","Y","Y"
"As of 03/19/2026","","","",""
"","As of 03/19/2026","","",""
`
      const downloader = new HttpCsvDownloader({ ratePerSecond: 1 })
      const districts = downloader.parseDistrictsFromSummary(csv)

      // Only valid alphanumeric district IDs should be kept
      expect(districts).toEqual(['02', '109', 'F', 'U'])
      // "As of 03/19/2026" should NOT appear
      expect(districts).not.toContain('As of 03/19/2026')
      expect(districts).not.toContain('As of 03')
    })
  })

  describe('parseClosingPeriodFromCsv (#278)', () => {
    it('should detect closing period when data month differs from collection month', () => {
      const csv = `"REGION","DISTRICT","DSP"
"01","02","Y"
"01","109","Y"
"Month of March, As of 04/01/2026","",""`
      const result = parseClosingPeriodFromCsv(csv, '2026-04-01')

      expect(result.isClosingPeriod).toBe(true)
      expect(result.dataMonth).toBe('2026-03')
    })

    it('should return non-closing when data month matches collection month', () => {
      const csv = `"REGION","DISTRICT","DSP"
"01","02","Y"
"Month of March, As of 03/15/2026","",""`
      const result = parseClosingPeriodFromCsv(csv, '2026-03-15')

      expect(result.isClosingPeriod).toBe(false)
      expect(result.dataMonth).toBe('2026-03')
    })

    it('should handle December closing period collected in January', () => {
      const csv = `"REGION","DISTRICT","DSP"
"01","02","Y"
"Month of December, As of 01/08/2027","",""`
      const result = parseClosingPeriodFromCsv(csv, '2027-01-08')

      expect(result.isClosingPeriod).toBe(true)
      expect(result.dataMonth).toBe('2026-12')
    })

    it('should handle June closing period collected in July', () => {
      const csv = `"REGION","DISTRICT","DSP"
"01","02","Y"
"Month of June, As of 07/20/2026","",""`
      const result = parseClosingPeriodFromCsv(csv, '2026-07-20')

      expect(result.isClosingPeriod).toBe(true)
      expect(result.dataMonth).toBe('2026-06')
    })

    it('should return non-closing when no footer is found', () => {
      const csv = `"REGION","DISTRICT","DSP"
"01","02","Y"
"01","109","Y"`
      const result = parseClosingPeriodFromCsv(csv, '2026-04-01')

      expect(result.isClosingPeriod).toBe(false)
      expect(result.dataMonth).toBeUndefined()
    })

    it('should return non-closing for empty CSV', () => {
      const result = parseClosingPeriodFromCsv('', '2026-04-01')

      expect(result.isClosingPeriod).toBe(false)
      expect(result.dataMonth).toBeUndefined()
    })

    it('should handle footer with extra whitespace', () => {
      const csv = `"REGION","DISTRICT"
"01","02"
"Month of January,  As of 02/05/2026",""`
      const result = parseClosingPeriodFromCsv(csv, '2026-02-05')

      expect(result.isClosingPeriod).toBe(true)
      expect(result.dataMonth).toBe('2026-01')
    })
  })
})
