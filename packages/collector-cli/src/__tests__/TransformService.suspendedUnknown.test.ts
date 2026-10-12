/**
 * Per-district `suspendedClubs` must not publish 0 for "unknown" (#1757).
 *
 * TM's 2023-24 `Charter Date/Suspend Date` column carries no `Susp` value at
 * all: the fixture is trimmed from staging raw-csv/2023-11-08/district-86/
 * (its one non-blank value is `Charter 09/29/23`). #1514 settled the rule one
 * layer up (global rollup): when no in-scope row carries a parseable `Susp`
 * date ANYWHERE in the date's population, the suspension count is unknown,
 * not zero; a populated column that sums to zero in the window is a measured
 * 0. The per-district rankings applied no such rule and wrote 0 for all 1430
 * district-dates of 2023-24.
 *
 * Unknown is represented as ABSENT, which is what the shared-contracts
 * schema (`suspendedClubs: z.number().optional()`) already allows.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import { fileURLToPath } from 'node:url'
import { TransformService } from '../services/TransformService.js'

const FIXTURE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures/no-susp-2023-24/2023-11-08'
)
const DATE = '2023-11-08'
// "Month of Oct, As of 11/08/2023": a closing collection, written to its
// month-end (#193).
const SNAPSHOT_DATE = '2023-10-31'

interface Row {
  districtId: string
  suspendedClubs?: number | null
  newCharteredClubs?: number
}

describe('TransformService — per-district suspendedClubs unknown vs zero (#1757)', () => {
  let tempDir: string
  let rawDir: string

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'transform-susp-'))
    rawDir = path.join(tempDir, 'raw-csv', DATE)
    await fs.cp(FIXTURE, rawDir, { recursive: true })
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  async function rankings(): Promise<Row[]> {
    await new TransformService({ cacheDir: tempDir }).transform({
      date: DATE,
      force: true,
    })
    const file = path.join(
      tempDir,
      'snapshots',
      SNAPSHOT_DATE,
      'all-districts-rankings.json'
    )
    return (JSON.parse(await fs.readFile(file, 'utf-8')) as { rankings: Row[] })
      .rankings
  }

  it('a date whose source carries no Susp value at all: suspendedClubs is absent, not 0', async () => {
    const d86 = (await rankings()).find(r => r.districtId === '86')!
    expect(d86).toBeDefined()
    expect(d86).not.toHaveProperty('suspendedClubs')
    // The charter branch of the same column is still measured.
    expect(d86.newCharteredClubs).toBe(1)
  })

  it('a populated Susp branch with nothing in the PY window is a measured 0, for every district of the date', async () => {
    // A second district whose column carries a Susp value from the PRIOR
    // program year: the branch was collected for this date, so a 0 in the
    // window is a measurement — for D86 too, whose own rows have none.
    const allDistricts = await fs.readFile(
      path.join(rawDir, 'all-districts.csv'),
      'utf-8'
    )
    const [header, d86Row, footer] = allDistricts.trim().split('\n')
    await fs.writeFile(
      path.join(rawDir, 'all-districts.csv'),
      [header, d86Row, d86Row!.replace('"86"', '"87"'), footer].join('\n') +
        '\n'
    )
    const d87 = path.join(rawDir, 'district-87')
    await fs.mkdir(d87)
    await fs.copyFile(
      path.join(rawDir, 'district-86', 'club-performance.csv'),
      path.join(d87, 'club-performance.csv')
    )
    await fs.writeFile(
      path.join(d87, 'district-performance.csv'),
      `"District","Division","Area","Club","Club Name","New","Late Ren.","Oct. Ren.","Apr. Ren.","Total Ren.","Total Chart","Total to Date","Distinguished Status","Charter Date/Suspend Date"
"87","A","01","00001234","Prior Year Suspension Club","0","0","0","0","0","0","0",""," Susp 05/31/23"
Month of Oct, As of 11/08/2023
`
    )

    const rows = await rankings()
    expect(rows.find(r => r.districtId === '86')!.suspendedClubs).toBe(0)
    expect(rows.find(r => r.districtId === '87')!.suspendedClubs).toBe(0)
  })
})
