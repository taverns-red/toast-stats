/**
 * rescrape `program_year` expands to the program year's month-ends from the
 * closing-date registry (#1766, ADR-015 P7, audit D-6).
 *
 * The step used to generate the 15th of each month with an inline `node -e`.
 * Prune deletes non-month-end dates, and #1669 refuses a past mid-month date
 * the dashboard no longer serves, so the input was dead or self-defeating.
 * A month-end is the snapshot date a close is filed under (#193), and the
 * registry (docs/month-end-closing-dates.json, ADR-011) lists the months
 * that have closed.
 */

import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { programYearMonthEnds } from '../programYearMonthEnds.js'

const REPO = process.cwd()
const CLI = path.join(REPO, 'scripts/program-year-month-ends.ts')
const TSX = path.join(REPO, 'node_modules/.bin/tsx')
const FIXTURE = path.join(
  REPO,
  'scripts/lib/__tests__/fixtures/closing-registry/month-end-closing-dates.json'
)
const months = (
  JSON.parse(fs.readFileSync(FIXTURE, 'utf-8')) as {
    months: Array<{ dataMonth: string; closingDate: string }>
  }
).months

const PY_2023_24 = [
  '2023-07-31',
  '2023-08-31',
  '2023-09-30',
  '2023-10-31',
  '2023-11-30',
  '2023-12-31',
  '2024-01-31',
  '2024-02-29',
  '2024-03-31',
  '2024-04-30',
  '2024-05-31',
  '2024-06-30',
]

describe('programYearMonthEnds (#1766, D-6)', () => {
  it('program_year=2023-2024 gives twelve month-end dates from the registry, no 15ths', () => {
    const dates = programYearMonthEnds('2023-2024', months)
    expect(dates).toEqual(PY_2023_24)
    expect(dates.some(d => d.endsWith('-15'))).toBe(false)
  })

  it('takes only the months inside the program year (the 2023-06 and 2024-07 neighbours stay out)', () => {
    const dates = programYearMonthEnds('2023-2024', months)
    expect(dates).not.toContain('2023-06-30')
    expect(dates).not.toContain('2024-07-31')
  })

  it('an in-progress program year gives only the months that have closed', () => {
    expect(programYearMonthEnds('2026-2027', months)).toEqual([
      '2026-07-31',
      '2026-08-31',
      '2026-09-30',
    ])
  })

  it('a program year with no closed month gives nothing (the caller fails)', () => {
    expect(programYearMonthEnds('2019-2020', months)).toEqual([])
  })

  it.each(['2023', '2023-2025', '2023-24', ' 2023-2024', '2023/2024'])(
    'rejects a malformed program year %j',
    py => {
      expect(() => programYearMonthEnds(py, months)).toThrow(/program year/)
    }
  )
})

describe('scripts/program-year-month-ends.ts', () => {
  const run = (...args: string[]) =>
    spawnSync(TSX, [CLI, ...args], { cwd: REPO, encoding: 'utf-8' })

  it('prints the month-ends space-separated on stdout, nothing else (R4)', () => {
    const r = run('2023-2024', '--registry', FIXTURE)
    expect(r.status, r.stderr).toBe(0)
    expect(r.stdout).toBe(`${PY_2023_24.join(' ')}\n`)
  })

  it('exits 1 when the program year has no closed month', () => {
    const r = run('2019-2020', '--registry', FIXTURE)
    expect(r.status).toBe(1)
    expect(r.stdout).toBe('')
    expect(r.stderr).toMatch(/2019-2020/)
  })

  it('exits 2 on a malformed program year', () => {
    expect(run('2023-24', '--registry', FIXTURE).status).toBe(2)
  })

  it('exits 1 when the registry cannot be read', () => {
    const r = run('2023-2024', '--registry', path.join(REPO, 'no-such.json'))
    expect(r.status).toBe(1)
    expect(r.stdout).toBe('')
  })

  it('reads the committed registry by default', () => {
    const r = run('2023-2024')
    expect(r.status, r.stderr).toBe(0)
    expect(r.stdout.trim().split(' ')).toEqual(PY_2023_24)
  })
})
