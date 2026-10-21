/**
 * Completeness gate: every promoted date has its reports in prod (#2144).
 *
 * On 2026-10-17 rebuild 39053839345 promoted 2026-10-16 without any of its
 * 94 district_*_reports.json. Since #1767 the sidecars reach prod through
 * the promote-reports job's manifest promote (reportSidecarPromotion.test.ts);
 * after it, check-report-sidecars.sh fails the run when a promoted date has a
 * sidecar staging holds and prod lacks, so a gap is never silent.
 *
 * The script runs for real against the gcloud shim.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
const REPO = process.cwd()
const CHECK = path.join(REPO, 'scripts/pipeline/check-report-sidecars.sh')
const SHIM_DIR = path.join(REPO, 'scripts/lib/__tests__/fixtures/gcloud-shim')
const STG = 'stg-bucket'
const PROD = 'prod-bucket'

describe('check-report-sidecars.sh (shim)', () => {
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

    it('passes once prod has them, and a date without reports is complete', () => {
      for (const d of ['2026-10-08', '2026-10-16']) {
        put(PROD, `snapshots/${d}/district_61_reports.json`)
        put(PROD, `snapshots/${d}/district_F_reports.json`)
      }
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
