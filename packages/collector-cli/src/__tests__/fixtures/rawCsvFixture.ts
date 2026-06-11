/**
 * Shared raw-csv fixture builder for the #1129 fail-closed remap tests.
 *
 * Builds CACHE_DIR/raw-csv/{date}/ with a minimal valid all-districts CSV
 * (footer-less by default — the undecided shape) and one district dir so
 * TransformService.transform can run end to end.
 */

import * as fs from 'node:fs/promises'
import * as path from 'node:path'

/** A valid all-districts CSV with NO "Month of …, As of …" footer */
export const FOOTERLESS_ALL_DISTRICTS_CSV = `DISTRICT,REGION,Paid Clubs,Paid Club Base,% Club Growth,Total YTD Payments,Payment Base,% Payment Growth,Active Clubs,Total Distinguished Clubs,Select Distinguished Clubs,Presidents Distinguished Clubs
42,Region 2,200,190,5.26%,2000,1900,5.26%,200,20,10,5`

export async function createRawCsvFixture(
  cacheDir: string,
  date: string,
  options: { csv?: string | null } = {}
): Promise<string> {
  const rawCsvDir = path.join(cacheDir, 'raw-csv', date)
  await fs.mkdir(rawCsvDir, { recursive: true })

  const csv =
    options.csv === undefined ? FOOTERLESS_ALL_DISTRICTS_CSV : options.csv
  if (csv !== null) {
    await fs.writeFile(path.join(rawCsvDir, 'all-districts.csv'), csv)
  }

  const districtDir = path.join(rawCsvDir, 'district-42')
  await fs.mkdir(districtDir, { recursive: true })
  await fs.writeFile(
    path.join(districtDir, 'club-performance.csv'),
    'Club Number,Club Name,Division,Area,Active Members,Goals Met\n1234,Test Club,A,1,20,5'
  )

  return rawCsvDir
}
