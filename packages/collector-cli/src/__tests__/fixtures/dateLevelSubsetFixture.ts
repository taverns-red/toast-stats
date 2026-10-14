/**
 * Real-shape raw-csv fixture for the date-level coverage tests (#1756,
 * ADR-015 P3).
 *
 * Headers, quoting and the "Month of …, As of …" footer are copied verbatim
 * from `gs://toast-stats-data-staging/raw-csv/2026-10-09/` (all-districts.csv
 * and district-49/*.csv, read 2026-10-11). The three all-districts rows are
 * the real rows for districts 02, 21 and 49; the per-district club rows are
 * trimmed to two clubs each, with membership and charter/suspend values
 * chosen so every district has a non-zero 20-plus, charter and suspension
 * count — a zero in the output can then only mean "input missing".
 */

import * as fs from 'node:fs/promises'
import * as path from 'node:path'

export const SUBSET_DATE = '2026-10-09'
export const SUBSET_DISTRICTS = ['02', '21', '49'] as const

/** The footer TI writes on every export for `date` (an October date). */
function footerFor(date: string): string {
  const [year, month, day] = date.split('-')
  return `Month of Oct, As of ${month}/${day}/${year}`
}

const ALL_DISTRICTS_HEADER =
  '"REGION","DISTRICT","DSP","Training","Market Analysis","Communication Plan","New Payments","April Payments","October Payments","Late Payments","Charter Payments","Total YTD Payments","Payment Base","% Payment Growth","Paid Club Base","Paid Clubs","% Club Growth","Active Clubs","Distinguished Clubs","Select Distinguished Clubs","Presidents Distinguished Clubs","Smedley Distinguished Clubs","Total Distinguished Clubs","% Distinguished Clubs"'

const ALL_DISTRICTS_ROWS: Record<string, string> = {
  '02': '"01","02","Y","N","Y","Y","254","702","2065","11","23","3055","6294","-51.46%","195","151","-22.56%","203","0","0","0","0","0","0%"',
  '21': '"01","21","Y","N","Y","Y","295","782","2132","12","97","3318","6406","-48.2%","171","149","-12.87%","184","0","0","0","0","0","0%"',
  '49': '"01","49","Y","N","Y","Y","85","262","833","8","34","1222","2164","-43.53%","65","57","-12.31%","66","0","0","0","0","0","0%"',
}

const CLUB_PERFORMANCE_HEADER =
  '"District","Division","Area","Club Number","Club Name","Club Status","CSP","Mem. Base","Active Members","Net Growth","Goals Met","Level 1s","Level 2s or EOM","Add. Level 2s or EOM","Level 3s","Level 4s, Path Completions, or DTM Awards","Add. Level 4s, Path Completions, or DTM award","New Members","Add. New Members","Off. Trained Round 1","Off. Trained Round 2","Mem. dues on time Oct","Mem. dues on time Apr","Off. List On Time","Club Distinguished Status"'

const DISTRICT_PERFORMANCE_HEADER =
  '"District","Division","Area","Club","Club Name","New","Late Ren.","Oct. Ren.","Apr. Ren.","Total Ren.","Total Chart","Total to Date","Distinguished Status","Charter Date/Suspend Date"'

const DIVISION_PERFORMANCE_HEADER =
  '"District","Division","Area","Club","Club Name","October Renewals","April Renewals","Nov Visit award","May Visit award","Membership to date","Club Goals Met","Distinguished Club","Area Club Base","Area Paid Club Goal for Dist.","Area Paid Club Goal for Select Dist.","Area Paid Club Goal for Pres. Dist.","Total Paid Area Clubs","Area Dist. Club Goal for Dist.","Area Dist. Club Goal for Select Dist.","Area Dist. Club Goal for Pres. Dist.","Total Dist. Area Clubs","Distinguished Area","Division Club Base","Division Paid Club Goal for Dist.","Division Paid Club Goal for Select Dist.","Division Paid Club Goal for Pres. Dist.","Total Paid Division Clubs","Division Dist. Club Goal for Dist.","Division Dist. Club Goal for Select Dist.","Division Dist. Club Goal for Pres. Dist.","Total Dist. Division Clubs","Distinguished Division","Charter Date/Suspend Date"'

function clubIds(districtId: string): [string, string] {
  const base = parseInt(districtId, 10) * 1000
  return [String(base + 1).padStart(8, '0'), String(base + 2).padStart(8, '0')]
}

function districtFiles(
  districtId: string,
  footer: string
): Record<string, string> {
  const [big, small] = clubIds(districtId)
  return {
    'club-performance.csv': [
      CLUB_PERFORMANCE_HEADER,
      `"${districtId}","A","01","${big}","Big Club ${districtId}","Active","Y","24","25","1","2","2","1","0","1","1","0","0","0","6","0","1","0","1",""`,
      `"${districtId}","A","01","${small}","Small Club ${districtId}","Active","Y","15","11","-4","1","1","0","0","1","0","0","1","0","4","0","1","0","1",""`,
      footer,
    ].join('\n'),
    'district-performance.csv': [
      DISTRICT_PERFORMANCE_HEADER,
      `"${districtId}","A","01","${big}","Big Club ${districtId}","1","0","20","0","20","5","25","","Charter 08/15/26"`,
      `"${districtId}","A","01","${small}","Small Club ${districtId}","0","0","11","0","11","0","11",""," Susp 09/30/26"`,
      footer,
    ].join('\n'),
    'division-performance.csv': [
      DIVISION_PERFORMANCE_HEADER,
      `"${districtId}","A","01","${big}","Big Club ${districtId}","1","0","1","0","25","2","","4","4","4","5","4","2","3","3","0","","16","16","17","18","16","8","8","9","0","",""`,
      `"${districtId}","A","01","${small}","Small Club ${districtId}","1","0","1","0","11","1","","4","4","4","5","4","2","3","3","0","","16","16","17","18","16","8","8","9","0","",""`,
      footer,
    ].join('\n'),
  }
}

/**
 * Write `raw-csv/<date>/all-districts.csv` naming all three districts, plus
 * the per-district raw directories for `withRaw` only.
 */
export async function writeSubsetRawCsv(
  cacheDir: string,
  withRaw: readonly string[]
): Promise<string> {
  return writeRawCsvForDate(cacheDir, SUBSET_DATE, SUBSET_DISTRICTS, withRaw)
}

/**
 * Write `raw-csv/<date>/all-districts.csv` naming `listed` (a subset of
 * SUBSET_DISTRICTS), plus a per-district raw directory for each of `withRaw`
 * — which may name districts the CSV does not, as a stale or hydrated
 * directory would (#1766, D-25). `date` must be an October date.
 */
export async function writeRawCsvForDate(
  cacheDir: string,
  date: string,
  listed: readonly string[],
  withRaw: readonly string[]
): Promise<string> {
  const footer = footerFor(date)
  const rawDir = path.join(cacheDir, 'raw-csv', date)
  await fs.mkdir(rawDir, { recursive: true })
  const csv = [
    ALL_DISTRICTS_HEADER,
    ...listed.map(id => {
      const row = ALL_DISTRICTS_ROWS[id]
      if (!row) throw new Error(`no real all-districts row for ${id}`)
      return row
    }),
    footer,
  ].join('\n')
  await fs.writeFile(path.join(rawDir, 'all-districts.csv'), csv)
  for (const districtId of withRaw) {
    const dir = path.join(rawDir, `district-${districtId}`)
    await fs.mkdir(dir, { recursive: true })
    for (const [name, body] of Object.entries(
      districtFiles(districtId, footer)
    )) {
      await fs.writeFile(path.join(dir, name), body)
    }
  }
  return rawDir
}

/**
 * District U, TI's undistricted bucket, as #1759's B4 rebuild found it
 * (#2035): the date's all-districts CSV names it (the real 2019-04-11 row,
 * mapped onto this fixture's header), its district report is a real CSV
 * (rows copied from `raw-csv/2019-04-11/district-U/district-performance.csv`),
 * and its club report is TI's 8082-byte XHTML error page, a #1671 gap.
 */
export const GAP_DISTRICT = 'U'

const GAP_ALL_DISTRICTS_ROW =
  '"DNAR","U","N","N","N","N","1230","1619","2033","85","601","5568","6135","-9.24%","120","139","15.83%","147","0","0","0","0","0","0%"'

/**
 * Add the gap district to the date written by `writeSubsetRawCsv`: its row in
 * all-districts.csv (before the footer) and a raw directory whose
 * club-performance.csv is `clubPerformanceBody`.
 */
export async function addGapDistrictRaw(
  cacheDir: string,
  clubPerformanceBody: string
): Promise<void> {
  const footer = footerFor(SUBSET_DATE)
  const rawDir = path.join(cacheDir, 'raw-csv', SUBSET_DATE)
  const csv = [
    ALL_DISTRICTS_HEADER,
    ...SUBSET_DISTRICTS.map(id => ALL_DISTRICTS_ROWS[id]),
    GAP_ALL_DISTRICTS_ROW,
    footer,
  ].join('\n')
  await fs.mkdir(rawDir, { recursive: true })
  await fs.writeFile(path.join(rawDir, 'all-districts.csv'), csv)
  const dir = path.join(rawDir, `district-${GAP_DISTRICT}`)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(
    path.join(dir, 'club-performance.csv'),
    clubPerformanceBody
  )
  await fs.writeFile(
    path.join(dir, 'district-performance.csv'),
    [
      DISTRICT_PERFORMANCE_HEADER,
      '"U","0D","0A","05159852","Toastmasters Costa Rica","10","19","14","14","47","0","57","",""',
      '"U","0D","0A","05331530","O.C. Debaters","0","0","0","0","0","0","0","",""',
      footer,
    ].join('\n')
  )
}
