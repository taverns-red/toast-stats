/**
 * Workflow contract: the status.taverns.red heartbeat (#2863, ops#343).
 *
 * After a successful, healthy prod promotion the pipeline pings the
 * Better Stack heartbeat (24 h period + 12 h grace). It pings on the daily
 * run, or on a manual dispatch that opted in with `recovery: true` AND
 * advanced prod's latest snapshot date. Plain rebuilds, an unhealthy
 * verdict and a staging-only proof run never ping. The URL is a secret: it
 * lives in `env:` only and is never echoed.
 *
 * The cases are evaluated by a tiny GitHub-expression interpreter over the
 * job's real `if:` string, so the test pins behaviour, not wording.
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
  env?: Record<string, string>
  'continue-on-error'?: boolean | string
}
interface Job {
  if?: string
  needs?: string | string[]
  outputs?: Record<string, string>
  permissions?: Record<string, string>
  steps?: Step[]
}

const source = fs.readFileSync(
  path.resolve(process.cwd(), '.github/workflows/data-pipeline.yml'),
  'utf-8'
)
const workflow = parse(source) as {
  on: { workflow_dispatch: { inputs: Record<string, Record<string, unknown>> } }
  permissions: Record<string, string>
  jobs: Record<string, Job>
}
const job = workflow.jobs['status-heartbeat']
const steps = job?.steps ?? []
const ping = steps.find(s => /curl/.test(s.run ?? ''))
const pipeline = workflow.jobs['pipeline']!

interface Ctx {
  event: string
  mode: string
  recovery: boolean
  newerDate: string
  promotedDates: string
  skipPromotion: string
  pipelineResult: string
  smokeResult: string
  unhealthy: string
}
const base: Ctx = {
  event: 'schedule',
  mode: 'daily',
  recovery: false,
  newerDate: 'true',
  promotedDates: '2026-11-14',
  skipPromotion: 'false',
  pipelineResult: 'success',
  smokeResult: 'success',
  unhealthy: '',
}

/** Evaluate the small expression subset the job's `if:` uses. */
function evaluate(expr: string, c: Ctx): boolean {
  const values: Record<string, string | boolean> = {
    'github.event_name': c.event,
    'inputs.recovery': c.recovery,
    'needs.pipeline.result': c.pipelineResult,
    'needs.pipeline.outputs.mode': c.mode,
    'needs.pipeline.outputs.skip_promotion': c.skipPromotion,
    'needs.pipeline.outputs.promoted': c.promotedDates ? 'true' : 'false',
    'needs.pipeline.outputs.promoted_dates': c.promotedDates,
    'needs.pipeline.outputs.prod_newer_date': c.newerDate,
    'needs.data-smoke.result': c.smokeResult,
    'needs.data-smoke.outputs.unhealthy': c.unhealthy,
  }
  const js = expr
    .replace(/\s+/g, ' ')
    .replace(/!cancelled\(\)/g, 'true')
    .replace(/\b(?:github|inputs|needs)\.[A-Za-z0-9_.-]+/g, m => {
      if (!(m in values)) throw new Error(`unmodelled context: ${m}`)
      return `__v[${JSON.stringify(m)}]`
    })
  return Boolean(new Function('__v', `return (${js})`)(values))
}

describe('status-heartbeat job (#2863)', () => {
  it('exists and waits on the pipeline and the data smoke', () => {
    expect(job).toBeDefined()
    const needs = [job!.needs ?? []].flat()
    expect(needs).toContain('pipeline')
    expect(needs).toContain('data-smoke')
  })

  it('declares a recovery input: boolean, default false', () => {
    const input = workflow.on.workflow_dispatch.inputs['recovery']
    expect(input).toBeDefined()
    expect(input!['type']).toBe('boolean')
    expect(input!['default']).toBe(false)
    expect(input!['required']).toBe(false)
  })

  it('pings on the scheduled daily that promoted', () => {
    expect(evaluate(job!.if ?? '', base)).toBe(true)
  })

  it('pings on a recovery dispatch that promoted a newer date', () => {
    expect(
      evaluate(job!.if ?? '', {
        ...base,
        event: 'workflow_dispatch',
        recovery: true,
        newerDate: 'true',
      })
    ).toBe(true)
  })

  it('never pings on a manual dispatch without recovery', () => {
    for (const mode of ['daily', 'rebuild', 'rescrape', 'prune']) {
      expect(
        evaluate(job!.if ?? '', {
          ...base,
          event: 'workflow_dispatch',
          mode,
          recovery: false,
          newerDate: 'true',
        }),
        mode
      ).toBe(false)
    }
  })

  it('never pings on a recovery dispatch that promoted no newer date', () => {
    expect(
      evaluate(job!.if ?? '', {
        ...base,
        event: 'workflow_dispatch',
        recovery: true,
        newerDate: 'false',
      })
    ).toBe(false)
    expect(
      evaluate(job!.if ?? '', {
        ...base,
        event: 'workflow_dispatch',
        recovery: true,
        newerDate: '',
      })
    ).toBe(false)
  })

  it('never pings when the run judged the data unhealthy', () => {
    for (const event of ['schedule', 'workflow_dispatch']) {
      expect(
        evaluate(job!.if ?? '', {
          ...base,
          event,
          recovery: true,
          unhealthy: 'true',
        }),
        event
      ).toBe(false)
    }
    expect(evaluate(job!.if ?? '', { ...base, smokeResult: 'failure' })).toBe(
      false
    )
    expect(evaluate(job!.if ?? '', { ...base, smokeResult: 'skipped' })).toBe(
      false
    )
  })

  it('never pings without a successful promotion, or on a proof run', () => {
    expect(evaluate(job!.if ?? '', { ...base, promotedDates: '' })).toBe(false)
    expect(
      evaluate(job!.if ?? '', { ...base, pipelineResult: 'failure' })
    ).toBe(false)
    expect(evaluate(job!.if ?? '', { ...base, skipPromotion: 'true' })).toBe(
      false
    )
  })

  it('never pings on the quarterly prune cron (a schedule that is not a daily)', () => {
    expect(evaluate(job!.if ?? '', { ...base, mode: 'prune' })).toBe(false)
  })

  it('has the skip, success and cancel guards as top-level conjuncts', () => {
    const cond = job!.if ?? ''
    expect(cond).toMatch(/^!cancelled\(\)/)
    const c = topLevelConjuncts(cond)
    expect(c).toContain("needs.pipeline.result == 'success'")
    expect(c).toContain("needs.pipeline.outputs.skip_promotion != 'true'")
    expect(c).toContain("needs.data-smoke.result == 'success'")
    expect(c).toContain("needs.data-smoke.outputs.unhealthy != 'true'")
  })

  it('is a leaf: no other job needs it', () => {
    for (const [name, j] of Object.entries(workflow.jobs)) {
      expect([j.needs ?? []].flat(), name).not.toContain('status-heartbeat')
    }
  })

  it('keeps permissions narrow: contents read, no id-token, no issues', () => {
    expect(job!.permissions).toEqual({ contents: 'read' })
  })

  it('leaves the workflow-level permissions untouched', () => {
    expect(workflow.permissions).toEqual({
      contents: 'read',
      'id-token': 'write',
      issues: 'write',
    })
  })
})

describe('the ping step (#2863)', () => {
  it('is a plain GET with --max-time and -fsS, output discarded', () => {
    expect(ping).toBeDefined()
    expect(ping!.run).toMatch(
      /curl\s+-fsS\s+--max-time\s+10\s+"\$HEARTBEAT_URL"\s+>\/dev\/null/
    )
  })

  it('reads the URL from the secret through env only', () => {
    expect(ping!.env?.['HEARTBEAT_URL']).toBe(
      '${{ secrets.STATUS_HEARTBEAT_TS_DATA }}'
    )
    expect(ping!.run).not.toMatch(/\$\{\{/)
  })

  it('never fails the run', () => {
    expect(ping!['continue-on-error']).toBe(true)
  })

  it('never echoes, logs or traces the URL, anywhere in the job', () => {
    for (const s of steps) {
      const run = s.run ?? ''
      expect(run, s.name).not.toMatch(/\becho\b[^\n]*HEARTBEAT/)
      expect(run, s.name).not.toMatch(/\bprintf\b[^\n]*HEARTBEAT/)
      expect(run, s.name).not.toMatch(/\bset\s+-[a-z]*x/)
      expect(run, s.name).not.toMatch(/--verbose|\s-v\s|--trace|--show-error/)
      expect(run, s.name).not.toMatch(/GITHUB_STEP_SUMMARY|GITHUB_OUTPUT/)
    }
  })

  it('uses the secret nowhere else in the workflow', () => {
    const uses = source.match(/STATUS_HEARTBEAT_TS_DATA/g) ?? []
    expect(uses).toHaveLength(1)
  })

  it('has no checkout, auth or install: it needs only curl', () => {
    const all = JSON.stringify(job)
    expect(all).not.toMatch(/google-github-actions|actions\/checkout|npm ci/)
  })
})

describe('the new-date comparison in the pipeline job (#2863)', () => {
  const before = pipeline.steps!.find(s => s.id === 'prodlatestbefore')
  const after = pipeline.steps!.find(s => s.id === 'heartbeatdate')
  const promote = pipeline.steps!.findIndex(s => s.id === 'promotemanifest')

  it('reads prod latest.json (read-only) before the promote step', () => {
    expect(before).toBeDefined()
    expect(pipeline.steps!.indexOf(before!)).toBeLessThan(promote)
    expect(before!.run).toMatch(/gcloud storage cat/)
    expect(before!.run).toMatch(/GCS_BUCKET_PRODUCTION/)
    expect(before!.run).not.toMatch(/storage (cp|rsync|mv|rm)/)
    expect(before!['continue-on-error']).toBe(true)
  })

  it('compares it to the promoted dates after the promote step, through the helper', () => {
    expect(after).toBeDefined()
    expect(pipeline.steps!.indexOf(after!)).toBeGreaterThan(promote)
    expect(after!.run).toMatch(/status-heartbeat\.ts/)
    expect(after!.env?.['PROD_LATEST_BEFORE']).toContain(
      'steps.prodlatestbefore.outputs.date'
    )
    expect(after!.env?.['PROMOTED_DATES']).toContain(
      'steps.promotemanifest.outputs.promoted_dates'
    )
    expect(after!['continue-on-error']).toBe(true)
  })

  it('exposes the verdict as a pipeline job output', () => {
    expect(pipeline.outputs?.['prod_newer_date']).toContain(
      'steps.heartbeatdate.outputs.newer'
    )
  })
})
