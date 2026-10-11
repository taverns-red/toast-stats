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

const FOOTER = 'Month of Oct, As of 10/09/2026'

const ALL_DISTRICTS_CSV = [
  '"REGION","DISTRICT","DSP","Training","Market Analysis","Communication Plan","New Payments","April Payments","October Payments","Late Payments","Charter Payments","Total YTD Payments","Payment Base","% Payment Growth","Paid Club Base","Paid Clubs","% Club Growth","Active Clubs","Distinguished Clubs","Select Distinguished Clubs","Presidents Distinguished Clubs","Smedley Distinguished Clubs","Total Distinguished Clubs","% Distinguished Clubs"',
  '"01","02","Y","N","Y","Y","254","702","2065","11","23","3055","6294","-51.46%","195","151","-22.56%","203","0","0","0","0","0","0%"',
  '"01","21","Y","N","Y","Y","295","782","2132","12","97","3318","6406","-48.2%","171","149","-12.87%","184","0","0","0","0","0","0%"',
  '"01","49","Y","N","Y","Y","85","262","833","8","34","1222","2164","-43.53%","65","57","-12.31%","66","0","0","0","0","0","0%"',
  FOOTER,
].join('\n')

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

function districtFiles(districtId: string): Record<string, string> {
  const [big, small] = clubIds(districtId)
  return {
    'club-performance.csv': [
      CLUB_PERFORMANCE_HEADER,
      `"${districtId}","A","01","${big}","Big Club ${districtId}","Active","Y","24","25","1","2","2","1","0","1","1","0","0","0","6","0","1","0","1",""`,
      `"${districtId}","A","01","${small}","Small Club ${districtId}","Active","Y","15","11","-4","1","1","0","0","1","0","0","1","0","4","0","1","0","1",""`,
      FOOTER,
    ].join('\n'),
    'district-performance.csv': [
      DISTRICT_PERFORMANCE_HEADER,
      `"${districtId}","A","01","${big}","Big Club ${districtId}","1","0","20","0","20","5","25","","Charter 08/15/26"`,
      `"${districtId}","A","01","${small}","Small Club ${districtId}","0","0","11","0","11","0","11",""," Susp 09/30/26"`,
      FOOTER,
    ].join('\n'),
    'division-performance.csv': [
      DIVISION_PERFORMANCE_HEADER,
      `"${districtId}","A","01","${big}","Big Club ${districtId}","1","0","1","0","25","2","","4","4","4","5","4","2","3","3","0","","16","16","17","18","16","8","8","9","0","",""`,
      `"${districtId}","A","01","${small}","Small Club ${districtId}","1","0","1","0","11","1","","4","4","4","5","4","2","3","3","0","","16","16","17","18","16","8","8","9","0","",""`,
      FOOTER,
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
  const rawDir = path.join(cacheDir, 'raw-csv', SUBSET_DATE)
  await fs.mkdir(rawDir, { recursive: true })
  await fs.writeFile(path.join(rawDir, 'all-districts.csv'), ALL_DISTRICTS_CSV)
  for (const districtId of withRaw) {
    const dir = path.join(rawDir, `district-${districtId}`)
    await fs.mkdir(dir, { recursive: true })
    for (const [name, body] of Object.entries(districtFiles(districtId))) {
      await fs.writeFile(path.join(dir, name), body)
    }
  }
  return rawDir
}
