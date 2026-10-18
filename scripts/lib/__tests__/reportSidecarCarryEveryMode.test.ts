/**
 * Every promoting run carries its promoted dates' report sidecars (#2144).
 *
 * On 2026-10-17 rebuild 39053839345 promoted 2026-10-16 without any of its
 * 94 district_*_reports.json: `place-reports` (and so the #1763 carry in
 * it) runs only when the daily scrape produced a snapshot date, i.e. never
 * in rebuild/rescrape/prune. The fix:
 *
 * - a `carry-reports` job, keyed on the run having promoted dates (any
 *   mode), runs carry-report-sidecars.sh for exactly those dates
 *   (CARRY_DATES), after place-reports and the education rollup;
 * - then a completeness gate (check-report-sidecars.sh): a promoted date
 *   whose sidecars staging holds and prod lacks fails the run, loudly.
 *
 * The scripts run for real against the gcloud shim.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { parse } from 'yaml'
import {
  findProdWriteSteps,
  topLevelConjuncts,
  SKIP_CLAUSE_DOWNSTREAM,
  type Workflow,
} from '../prodWriteGuard.js'

const REPO = process.cwd()
const CARRY = path.join(REPO, 'scripts/pipeline/carry-report-sidecars.sh')
const CHECK = path.join(REPO, 'scripts/pipeline/check-report-sidecars.sh')
const SHIM_DIR = path.join(REPO, 'scripts/lib/__tests__/fixtures/gcloud-shim')
const STG = 'stg-bucket'
const PROD = 'prod-bucket'

interface Step {
  name?: string
  id?: string
  if?: string
  run?: string
  env?: Record<string, string>
  'continue-on-error'?: boolean
}
interface Job {
  if?: string
  needs?: string[] | string
  steps?: Step[]
}

const workflow = parse(
  fs.readFileSync(
    path.join(REPO, '.github/workflows/data-pipeline.yml'),
    'utf-8'
  )
) as Workflow & { jobs: Record<string, Job> }

const JOB = 'carry-reports'
const CARRY_STEP = '[reports] Carry the promoted dates’ report sidecars (#2144)'
const GATE_STEP =
  '[reports] Completeness gate: promoted dates have their reports (#2144)'

describe('carry-reports job (#2144)', () => {
  const job = workflow.jobs[JOB]
  const steps = (job?.steps ?? []) as Step[]
  const step = (n: string) => steps.find(s => s.name === n)

  it('runs in every mode that promoted a date, not only the daily', () => {
    expect(job, 'carry-reports job').toBeDefined()
    const expr = job?.if ?? ''
    const c = topLevelConjuncts(expr)
    expect(c).toContain("needs.pipeline.result == 'success'")
    expect(c).toContain("needs.pipeline.outputs.promoted_dates != ''")
    expect(c).toContain(SKIP_CLAUSE_DOWNSTREAM)
    // Not keyed on the daily scrape (the 10-17 hole) or on a mode.
    expect(expr).not.toContain('snapshot_date')
    expect(expr).not.toContain('mode')
    // A skipped place-reports / education-rollup must not skip it.
    expect(expr).toMatch(/always\(\)|!cancelled\(\)/)
  })

  it('runs after the placement and the rollups it carries', () => {
    const needs = ([] as string[]).concat(job?.needs ?? [])
    expect(needs).toEqual(
      expect.arrayContaining(['pipeline', 'place-reports', 'education-rollup'])
    )
  })

  it('carries exactly the promoted dates, and a failure is not swallowed', () => {
    const carry = step(CARRY_STEP)
    expect(carry?.run).toContain(
      'bash scripts/pipeline/carry-report-sidecars.sh "${GCS_BUCKET}" "${GCS_BUCKET_PRODUCTION}"'
    )
    expect(carry?.env?.CARRY_DATES).toBe(
      '${{ needs.pipeline.outputs.promoted_dates }}'
    )
    expect(carry?.['continue-on-error']).not.toBe(true)
  })

  it('gates completeness after the carry, even when the carry failed', () => {
    const gate = step(GATE_STEP)
    expect(gate?.run).toContain(
      'bash scripts/pipeline/check-report-sidecars.sh "${GCS_BUCKET}" "${GCS_BUCKET_PRODUCTION}" "${PROMOTED_DATES}"'
    )
    expect(gate?.env?.PROMOTED_DATES).toBe(
      '${{ needs.pipeline.outputs.promoted_dates }}'
    )
    expect(gate?.if).toContain('!cancelled()')
    expect(gate?.['continue-on-error']).not.toBe(true)
    const idx = (n: string) => steps.findIndex(s => s.name === n)
    expect(idx(GATE_STEP)).toBeGreaterThan(idx(CARRY_STEP))
  })

  it('the prod-write guard sees the carry, and it is skip_promotion-guarded', () => {
    const found = findProdWriteSteps(workflow).find(
      s => s.job === JOB && s.step === CARRY_STEP
    )
    expect(found?.reasons).toEqual(['report sidecar carry → production'])
    expect(found?.guarded).toBe(true)
  })
})

describe('carry + completeness gate scripts (shim)', () => {
  let tmp: string
  let root: string
  let log: string

  const put = (bucket: string, rel: string, body = '{}') => {
    const f = path.join(root, bucket, rel)
    fs.mkdirSync(path.dirname(f), { recursive: true })
    fs.writeFileSync(f, body)
    const m = path.join(root, '.meta', bucket, rel)
    fs.mkdirSync(path.dirname(m), { recursive: true })
    fs.writeFileSync(m, '')
  }
  const has = (bucket: string, rel: string) =>
    fs.existsSync(path.join(root, bucket, rel))
  const exec = (
    script: string,
    args: string[],
    env: Record<string, string> = {}
  ) =>
    spawnSync('bash', [script, ...args], {
      cwd: REPO,
      encoding: 'utf-8',
      env: {
        ...process.env,
        PATH: `${SHIM_DIR}:${process.env.PATH}`,
        GCLOUD: path.join(SHIM_DIR, 'gcloud'),
        SHIM_ROOT: root,
        SHIM_LOG: log,
        GITHUB_STEP_SUMMARY: path.join(tmp, 'summary.md'),
        ...env,
      },
    })

  const DATES = [
    '2026-10-08',
    '2026-10-09',
    '2026-10-10',
    '2026-10-11',
    '2026-10-12',
    '2026-10-13',
    '2026-10-14',
    '2026-10-15',
    '2026-10-16',
  ]

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carry-every-mode-'))
    root = path.join(tmp, 'gcs')
    log = path.join(tmp, 'gcloud.log')
    // Prod indexes nine dates; a rebuild just promoted 10-08 (older than
    // the newest-7 window) and 10-16, neither with its sidecars.
    put(PROD, 'v1/dates.json', JSON.stringify({ dates: DATES }))
    for (const d of DATES) {
      put(STG, `snapshots/${d}/district_61.json`)
      put(PROD, `snapshots/${d}/district_61.json`)
    }
    for (const d of ['2026-10-08', '2026-10-15', '2026-10-16']) {
      put(STG, `snapshots/${d}/district_61_reports.json`)
      put(STG, `snapshots/${d}/district_F_reports.json`)
    }
    // A staging-only date prod does not index.
    put(STG, 'snapshots/2026-10-17/district_61_reports.json')
  })

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  describe('carry-report-sidecars.sh with CARRY_DATES', () => {
    it('carries exactly the given dates, however old', () => {
      const r = exec(CARRY, [STG, PROD], {
        CARRY_DATES: '2026-10-08,2026-10-16',
      })
      expect(r.status, r.stderr).toBe(0)
      for (const d of ['2026-10-08', '2026-10-16']) {
        expect(has(PROD, `snapshots/${d}/district_61_reports.json`)).toBe(true)
        expect(has(PROD, `snapshots/${d}/district_F_reports.json`)).toBe(true)
      }
      // Not in CARRY_DATES: left for the daily's newest-N sweep.
      expect(has(PROD, 'snapshots/2026-10-15/district_61_reports.json')).toBe(
        false
      )
    })

    it('never carries a given date prod does not index', () => {
      const r = exec(CARRY, [STG, PROD], {
        CARRY_DATES: '2026-10-17,2026-10-16',
      })
      expect(r.status, r.stderr).toBe(0)
      expect(fs.existsSync(path.join(root, PROD, 'snapshots/2026-10-17'))).toBe(
        false
      )
      expect(has(PROD, 'snapshots/2026-10-16/district_61_reports.json')).toBe(
        true
      )
      expect(r.stderr).toContain('2026-10-17')
    })

    it('unset, it keeps the newest-N sweep', () => {
      const r = exec(CARRY, [STG, PROD])
      expect(r.status, r.stderr).toBe(0)
      expect(has(PROD, 'snapshots/2026-10-15/district_61_reports.json')).toBe(
        true
      )
      expect(has(PROD, 'snapshots/2026-10-08/district_61_reports.json')).toBe(
        false
      )
    })
  })

  describe('check-report-sidecars.sh', () => {
    it('FAILS when a promoted date has staging sidecars and none in prod', () => {
      const r = exec(CHECK, [STG, PROD, '2026-10-14,2026-10-16'])
      expect(r.status).toBe(1)
      expect(r.stderr).toMatch(/::error::.*2026-10-16/)
      expect(r.stderr).not.toMatch(/::error::.*2026-10-14/)
    })

    it('FAILS when prod holds only some of them', () => {
      put(PROD, 'snapshots/2026-10-16/district_61_reports.json')
      const r = exec(CHECK, [STG, PROD, '2026-10-16'])
      expect(r.status).toBe(1)
      expect(r.stderr).toContain('district_F_reports.json')
    })

    it('FAILS when staging has the reports rollup and prod does not', () => {
      put(STG, 'snapshots/2026-10-14/reports-rollups.json')
      const r = exec(CHECK, [STG, PROD, '2026-10-14'])
      expect(r.status).toBe(1)
      expect(r.stderr).toContain('reports-rollups.json')
    })

    it('passes after the carry, and a date without reports is complete', () => {
      expect(
        exec(CARRY, [STG, PROD], { CARRY_DATES: '2026-10-08,2026-10-16' })
          .status
      ).toBe(0)
      const r = exec(CHECK, [STG, PROD, '2026-10-08,2026-10-14,2026-10-16'])
      expect(r.status, r.stderr).toBe(0)
      expect(fs.readFileSync(path.join(tmp, 'summary.md'), 'utf-8')).toMatch(
        /3 promoted date\(s\)/
      )
    })

    it('only reads: no copy, rsync or delete', () => {
      exec(CHECK, [STG, PROD, '2026-10-16'])
      expect(fs.readFileSync(log, 'utf-8')).not.toMatch(
        /^storage (cp|rsync|rm|mv)\b/m
      )
    })

    it('fails on a listing transport error rather than reading it as empty', () => {
      put(PROD, 'snapshots/2026-10-16/district_61_reports.json')
      put(PROD, 'snapshots/2026-10-16/district_F_reports.json')
      const r = exec(CHECK, [STG, PROD, '2026-10-16'], {
        SHIM_FAIL_MATCH: `^ls gs://${STG}/snapshots/2026-10-16/`,
      })
      expect(r.status).toBe(1)
    })

    it('refuses bad usage', () => {
      expect(exec(CHECK, [STG, PROD]).status).toBe(2)
      expect(exec(CHECK, [STG, STG, '2026-10-16']).status).toBe(2)
      expect(exec(CHECK, [STG, PROD, 'x']).status).toBe(2)
    })
  })
})
