/**
 * `scripts/build-global-totals.ts` — behavioural tests (#1498, epic #1496).
 *
 * The rollup rules are unit-tested in analytics-core. What is tested here is
 * the thing only the RUNNER can get wrong: whether it refuses to publish an
 * artifact built from incomplete input.
 *
 * That matters because the backfill's GCS sync is deliberately fail-soft
 * (`|| true`, R2). If the district files half-arrive, the club, payment and
 * membership sums come out understated while `paidClubs` and the tier counts
 * — read from the rankings rows — stay whole. Nothing looks broken. That is
 * exactly the silent-failure shape (#1436-#1443) the epic exists to avoid, so
 * "some districts had no file" has to be an exit code, not a log line.
 *
 * Runs the real script against a temp directory. No network.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const SCRIPT = resolve(process.cwd(), 'scripts/build-global-totals.ts')
const DATE = '2026-06-30'

let dir: string
let snapshotDir: string

const ranking = (districtId: string) => ({
  districtId,
  districtName: `District ${districtId}`,
  region: 'I',
  paidClubs: 2,
  paidClubBase: 2,
  clubGrowthPercent: 0,
  totalPayments: 40,
  paymentBase: 40,
  paymentGrowthPercent: 0,
  activeClubs: 2,
  distinguishedClubs: 1,
  selectDistinguished: 0,
  presidentsDistinguished: 0,
  smedleyDistinguished: 0,
  distinguishedPercent: 50,
  clubsRank: 1,
  paymentsRank: 1,
  distinguishedRank: 1,
  aggregateScore: 1,
  overallRank: 1,
})

function writeDistrict(districtId: string): void {
  writeFileSync(
    join(snapshotDir, `district_${districtId}.json`),
    JSON.stringify({
      districtId,
      data: {
        districtId,
        snapshotDate: DATE,
        clubs: [],
        districtPerformance: [
          { Club: '0000001' + districtId, 'Total to Date': '20' },
        ],
        clubPerformance: [
          { 'Club Number': '0000001' + districtId, 'Active Members': '15' },
        ],
      },
    })
  )
}

function run(...extra: string[]) {
  return spawnSync(
    'npx',
    ['tsx', SCRIPT, '--snapshot-dir', snapshotDir, '--date', DATE, ...extra],
    { encoding: 'utf-8', cwd: process.cwd() }
  )
}

const artifact = () => join(snapshotDir, 'global-totals.json')

describe('build-global-totals runner (#1498)', () => {
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'build-global-totals-'))
    snapshotDir = join(dir, DATE)
    mkdirSync(snapshotDir)
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('writes the artifact when every listed district supplied a file', () => {
    writeFileSync(
      join(snapshotDir, 'all-districts-rankings.json'),
      JSON.stringify({ rankings: [ranking('61'), ranking('62')] })
    )
    writeDistrict('61')
    writeDistrict('62')

    const result = run()

    expect(result.status).toBe(0)
    expect(existsSync(artifact())).toBe(true)
    expect(JSON.parse(result.stdout)).toMatchObject({
      date: DATE,
      districts: 2,
      clubs: 2,
      payments: 40,
      membership: 30,
    })
  })

  it('REFUSES to publish when a listed district supplied no file', () => {
    // District 62 is in the date's set but its download did not arrive. The
    // rollup would report 1 club / 20 payments against a rankings-derived
    // 4 paid clubs — plausible, and wrong.
    writeFileSync(
      join(snapshotDir, 'all-districts-rankings.json'),
      JSON.stringify({ rankings: [ranking('61'), ranking('62')] })
    )
    writeDistrict('61')

    const result = run()

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('62')
    expect(result.stderr).toMatch(/refusing to publish/i)
    expect(existsSync(artifact())).toBe(false)
  })

  it('publishes under an explicit operator override, saying so loudly', () => {
    writeFileSync(
      join(snapshotDir, 'all-districts-rankings.json'),
      JSON.stringify({ rankings: [ranking('61'), ranking('62')] })
    )
    writeDistrict('61')

    const result = run('--allow-missing-districts')

    expect(result.status).toBe(0)
    expect(result.stderr).toMatch(/OVERRIDDEN/)
    expect(result.stderr).toMatch(/understated/)
    expect(existsSync(artifact())).toBe(true)
  })

  it('refuses a date with no district set rather than scoping by guesswork', () => {
    writeDistrict('61')

    const result = run()

    expect(result.status).toBe(2)
    expect(result.stderr).toMatch(/all-districts-rankings\.json/)
    expect(existsSync(artifact())).toBe(false)
  })
})
