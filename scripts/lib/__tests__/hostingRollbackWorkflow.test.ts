/**
 * Workflow contract: automatic Hosting rollback in deploy.yml (#2492).
 *
 * The production deploy must
 * - record the live Hosting version BEFORE `firebase deploy`,
 * - smoke the core path (home, a district page, a CDN data fetch) for
 *   ~10 minutes after it,
 * - on a failed smoke, re-release the recorded version on the existing CI
 *   identity (no new secrets), smoke the restored release, file or update
 *   a `hosting-rollback` issue, and fail the job loudly;
 * - honour an override (dispatch input or repo variable) that skips the
 *   rollback but still files the issue and fails.
 * Sourced from the YAML so the ordering cannot drift.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { parse } from 'yaml'

const ROOT = process.cwd()
const FILE = path.resolve(ROOT, '.github/workflows/deploy.yml')

interface Step {
  name?: string
  id?: string
  if?: string
  run?: string
  uses?: string
  env?: Record<string, string>
  with?: Record<string, unknown>
  'working-directory'?: string
}
interface Job {
  steps: Step[]
  env?: Record<string, string>
  'timeout-minutes'?: number
}
interface Workflow {
  on: Record<string, { inputs?: Record<string, Record<string, unknown>> }>
  permissions?: Record<string, string>
  jobs: Record<string, Job>
}

const raw = fs.readFileSync(FILE, 'utf-8')
const wf = parse(raw) as Workflow
const job = wf.jobs['deploy-frontend'] as Job
const steps = job.steps
const idx = (name: string) => {
  const i = steps.findIndex(s => s.name === name)
  expect(i, `step "${name}" exists`).toBeGreaterThan(-1)
  return i
}
const step = (name: string) => steps[idx(name)] as Step

const RECORD = 'Record the live Hosting version'
const DEPLOY = 'Build and deploy production'
const SMOKE = 'Smoke the new release'
const ROLLBACK = 'Roll back to the recorded version'
const RESTORED = 'Smoke the restored release'
const ALERT = 'Open or update the rollback issue'
const FAIL = 'Fail the deploy when the smoke failed'

describe('deploy.yml auto-rollback (#2492)', () => {
  it('orders record → deploy → smoke → rollback → restored smoke → alert → fail', () => {
    const order = [RECORD, DEPLOY, SMOKE, ROLLBACK, RESTORED, ALERT, FAIL].map(
      idx
    )
    expect(order).toEqual([...order].sort((a, b) => a - b))
  })

  it('installs the smoke browser before deploying, so its failure cannot strand an unsmoked release', () => {
    const install = steps.findIndex(s =>
      /npx playwright install --with-deps chromium/.test(s.run ?? '')
    )
    expect(install).toBeGreaterThan(-1)
    expect(install).toBeLessThan(idx(DEPLOY))
  })

  it('records the live version with the tested runner, after auth and before deploy', () => {
    const s = step(RECORD)
    expect(s.id).toBe('record')
    expect(s.run).toContain(
      'npx tsx scripts/hosting-release.ts record production'
    )
    expect(s.env?.['PROJECT']).toBe('${{ secrets.GCP_PROJECT_ID }}')
    expect(idx('Authenticate to GCP')).toBeLessThan(idx(RECORD))
  })

  it('the deploy step has an id the later steps key off', () => {
    expect(step(DEPLOY).id).toBe('deploy')
    expect(step(DEPLOY).run).toMatch(
      /firebase deploy --only hosting:production/
    )
  })

  it('smokes the new release for ~10 minutes against the build it just deployed', () => {
    const s = step(SMOKE)
    expect(s.id).toBe('smoke')
    expect(s.run).toContain('npx tsx scripts/hosting-smoke.ts')
    expect(s.env?.['SMOKE_WINDOW_SECONDS']).toBe('600')
    expect(s.env?.['EXPECTED_INDEX_HTML']).toBe('frontend/dist/index.html')
    expect(s.env?.['BASE_URL']).toBe('https://ts.taverns.red')
    expect(s.env?.['CDN_BASE_URL']).toBe('https://cdn.taverns.red')
  })

  it('rolls back even if the smoke runner crashed (no output), never on cancel or a failed deploy', () => {
    const cond = step(ROLLBACK).if ?? ''
    expect(cond).toContain('!cancelled()')
    expect(cond).toContain("steps.deploy.outcome == 'success'")
    expect(cond).toContain("steps.smoke.outputs.healthy != 'true'")
    expect(cond).toContain("env.AUTO_ROLLBACK == 'on'")
  })

  it('rolls back to the recorded version with the tested runner on the CI identity', () => {
    const s = step(ROLLBACK)
    expect(s.id).toBe('rollback')
    expect(s.run).toContain(
      'npx tsx scripts/hosting-release.ts rollback production'
    )
    expect(s.env?.['PREVIOUS_VERSION']).toBe(
      '${{ steps.record.outputs.version }}'
    )
    expect(s.env?.['PROJECT']).toBe('${{ secrets.GCP_PROJECT_ID }}')
    const runner = fs.readFileSync(
      path.resolve(ROOT, 'scripts/hosting-release.ts'),
      'utf-8'
    )
    expect(runner).toContain('hosting:clone')
  })

  it('re-smokes only a release it actually restored, with no expected entry asset', () => {
    const s = step(RESTORED)
    expect(s.id).toBe('restored_smoke')
    expect(s.if).toContain("steps.rollback.outputs.rolled_back == 'true'")
    expect(s.if).toContain('!cancelled()')
    expect(s.run).toContain('npx tsx scripts/hosting-smoke.ts')
    expect(s.env?.['EXPECTED_INDEX_HTML'] ?? '').toBe('')
  })

  it('files or updates a hosting-rollback issue the way the CDN canary does', () => {
    const s = step(ALERT)
    expect(s.if).toContain('!cancelled()')
    expect(s.if).toContain("steps.smoke.outputs.healthy != 'true'")
    expect(s.run).toContain('--label hosting-rollback')
    expect(s.run).toContain('gh issue comment')
    expect(s.run).toContain('gh issue create')
    expect(s.env?.['GH_TOKEN']).toBe('${{ github.token }}')
    const report = steps.findIndex(s =>
      (s.run ?? '').includes('npx tsx scripts/hosting-release.ts report')
    )
    expect(report).toBeGreaterThan(idx(RESTORED))
    expect(report).toBeLessThan(idx(ALERT))
  })

  it('fails the job loudly with ::error:: when the smoke failed', () => {
    const s = step(FAIL)
    expect(s.if).toContain('!cancelled()')
    expect(s.if).toContain("steps.smoke.outputs.healthy != 'true'")
    expect(s.run).toContain('::error::')
    expect(s.run).toMatch(/exit 1/)
  })

  it('records DORA metrics only after a healthy smoke', () => {
    expect(idx('Record DORA deploy metrics')).toBeGreaterThan(idx(FAIL))
  })

  it('offers an override as a dispatch input and a repo variable', () => {
    for (const trigger of ['workflow_dispatch', 'workflow_call']) {
      const input = wf.on[trigger]?.inputs?.['skip_auto_rollback']
      expect(input?.['type'], trigger).toBe('boolean')
      expect(input?.['default'], trigger).toBe(false)
    }
    const env = job.env?.['AUTO_ROLLBACK'] ?? ''
    expect(env).toContain('inputs.skip_auto_rollback')
    expect(env).toContain("vars.HOSTING_AUTO_ROLLBACK == 'off'")
  })

  it('adds no secrets beyond the existing CI identity', () => {
    const used = new Set(
      [...raw.matchAll(/secrets\.([A-Z_]+)/g)].map(m => m[1])
    )
    expect([...used].sort()).toEqual([
      'GCP_PROJECT_ID',
      'GCP_SERVICE_ACCOUNT',
      'GCP_WORKLOAD_IDENTITY_PROVIDER',
    ])
  })

  it('can write issues, here and in the release-please caller that caps it', () => {
    expect(wf.permissions?.['issues']).toBe('write')
    const rp = parse(
      fs.readFileSync(
        path.resolve(ROOT, '.github/workflows/release-please.yml'),
        'utf-8'
      )
    ) as Workflow
    expect(rp.permissions?.['issues']).toBe('write')
  })

  it('bounds the job so a hung smoke cannot hold the deploy lock forever', () => {
    expect(job['timeout-minutes']).toBeGreaterThanOrEqual(30)
    expect(job['timeout-minutes']).toBeLessThanOrEqual(60)
  })
})
