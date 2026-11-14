/**
 * Workflow contract: the data smoke after every promotion (#2538, epic #2492).
 *
 * The cdn-data probe in scripts/hosting-smoke.ts used to run only after a
 * Hosting deploy, so a bad data publish with no Hosting change went unseen
 * until the 14:00 UTC freshness monitor. The `data-smoke` job runs the probe
 * and the CDN schema check against cdn.taverns.red after the last prod
 * writer (`promote-reports`), and fails the run visibly when either fails.
 *
 * It must never block or alter a promotion: it runs AFTER them, only reads
 * the public CDN (no GCP auth, no gcloud), nothing needs it, and the steps
 * carry no `continue-on-error`. A failure only marks the run red.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { parse } from 'yaml'
import { topLevelConjuncts } from '../prodWriteGuard.js'

interface Step {
  name?: string
  id?: string
  if?: string
  run?: string
  uses?: string
  env?: Record<string, string>
  'continue-on-error'?: boolean | string
}
interface Job {
  if?: string
  needs?: string | string[]
  'timeout-minutes'?: number | string
  'continue-on-error'?: boolean | string
  permissions?: Record<string, string>
  steps?: Step[]
}

const source = fs.readFileSync(
  path.resolve(process.cwd(), '.github/workflows/data-pipeline.yml'),
  'utf-8'
)
const workflow = parse(source) as { jobs: Record<string, Job> }
const job = workflow.jobs['data-smoke']
const steps = job?.steps ?? []
const idx = (pred: (s: Step) => boolean) => steps.findIndex(pred)
const smokeIdx = idx(s => /scripts\/hosting-smoke\.ts/.test(s.run ?? ''))
const schemaIdx = idx(s => /scripts\/check-cdn-schema\.ts/.test(s.run ?? ''))

describe('data-smoke job (#2538)', () => {
  it('exists and runs after the pipeline and the sidecar promote', () => {
    expect(job).toBeDefined()
    const needs = [job!.needs ?? []].flat()
    expect(needs).toContain('pipeline')
    expect(needs).toContain('promote-reports')
  })

  it('runs after a successful pipeline that promoted, never on a proof run or a cancel', () => {
    expect(job!.if ?? '').toMatch(/^!cancelled\(\)/)
    const c = topLevelConjuncts(job!.if ?? '')
    expect(c).toContain("needs.pipeline.result == 'success'")
    expect(c).toContain("needs.pipeline.outputs.skip_promotion != 'true'")
  })

  it('runs only when something was promoted (held days stay quiet)', () => {
    const flat = (job!.if ?? '').replace(/\s+/g, ' ')
    // One parenthesised OR group, ANDed in at the top level (so it cannot be
    // swallowed by, or turned into, a top-level OR).
    expect(flat).toContain(
      "&& (needs.pipeline.outputs.promoted == 'true' || needs.pipeline.outputs.promoted_dates != '')"
    )
    expect(topLevelConjuncts(job!.if ?? '')).toContain('⟨group⟩')
  })

  it('drops the workflow id-token and issues grants: contents read only', () => {
    expect(job!.permissions).toEqual({ contents: 'read' })
  })

  it('runs the cdn-data probe from hosting-smoke.ts against cdn.taverns.red', () => {
    expect(smokeIdx).toBeGreaterThan(-1)
    const s = steps[smokeIdx]!
    expect(s.env?.['CDN_BASE_URL']).toBe('https://cdn.taverns.red')
    expect(s.env?.['SMOKE_RENDER']).toBe('off')
  })

  it('runs the CDN schema check against cdn.taverns.red, after the smoke', () => {
    expect(schemaIdx).toBeGreaterThan(smokeIdx)
    const s = steps[schemaIdx]!
    expect(s.id).toBeTruthy()
    expect(s.if ?? '').toContain('!cancelled()')
    expect(s.env?.['CDN_BASE_URL'] ?? 'https://cdn.taverns.red').toBe(
      'https://cdn.taverns.red'
    )
  })

  it('builds shared-contracts before the schema check imports it', () => {
    const build = idx(s => /build.*shared-contracts/.test(s.run ?? ''))
    expect(build).toBeGreaterThan(-1)
    expect(build).toBeLessThan(schemaIdx)
  })

  it('ends with a step that fails the run when either check failed', () => {
    const last = steps[steps.length - 1]!
    expect(steps.length - 1).toBeGreaterThan(schemaIdx)
    expect(last.if ?? '').toContain('!cancelled()')
    expect(last.if).toContain(`steps.${steps[smokeIdx]!.id}.outputs.healthy`)
    expect(last.if).toContain(`steps.${steps[schemaIdx]!.id}.outputs.unhealthy`)
    expect(last.run).toContain('::error')
    expect(last.run).toMatch(/exit 1/)
  })

  it('names which check failed in the final error', () => {
    const last = steps[steps.length - 1]!
    const run = last.run ?? ''
    expect(run).toMatch(/data probe/)
    expect(run).toMatch(/Hosting probes/)
    expect(run).toMatch(/schema check/)
    expect(run).toContain('cdn-data')
    // the smoke result file's failing probe names feed the message
    expect(last.env?.['SMOKE_RESULT_FILE']).toContain(
      `steps.${steps[smokeIdx]!.id}.outputs.result_file`
    )
    expect(run).not.toMatch(/the published data failed after/)
  })

  it('never uses continue-on-error, on the job or any step', () => {
    expect(job!['continue-on-error']).toBeUndefined()
    for (const s of steps) {
      expect(s['continue-on-error'], s.name).toBeUndefined()
    }
  })

  it('only reads: no GCP auth, no gcloud, no promoter', () => {
    const text = steps.map(s => `${s.uses ?? ''}\n${s.run ?? ''}`).join('\n')
    expect(text).not.toMatch(/google-github-actions/)
    expect(text).not.toMatch(/gcloud|gsutil|promote-run-manifest/)
  })

  it('is bounded and is not a prerequisite of any other job', () => {
    expect(Number(job!['timeout-minutes'])).toBeLessThanOrEqual(15)
    for (const [name, j] of Object.entries(workflow.jobs)) {
      expect([j.needs ?? []].flat(), name).not.toContain('data-smoke')
    }
  })
})
