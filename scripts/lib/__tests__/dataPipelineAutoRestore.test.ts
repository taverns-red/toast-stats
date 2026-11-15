/**
 * Workflow contract: the data auto-restore (#2537, epic #2492).
 *
 * When the post-promotion data smoke (#2538) reports bad data, the
 * `data-auto-restore` job plans a restore of the objects the run wrote with
 * the one planner (scripts/plan-data-restore.ts, #2539), and files a
 * `data-rollback` issue. It restores only when the repository variable
 * DATA_AUTO_RESTORE is exactly `execute`; unset it is a dry run (plan only).
 * This PR never sets the variable. A refused entry aborts the whole execute.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { parse } from 'yaml'
import {
  SKIP_CLAUSE_DOWNSTREAM,
  findProdWriteSteps,
  prodWriteReasons,
  topLevelConjuncts,
} from '../prodWriteGuard.js'
import { DEFAULT_RESTORE_MODE } from '../dataAutoRestore.js'

interface Step {
  name?: string
  id?: string
  if?: string
  run?: string
  uses?: string
  with?: Record<string, string>
  env?: Record<string, string>
  'continue-on-error'?: boolean | string
}
interface Job {
  if?: string
  needs?: string | string[]
  outputs?: Record<string, string>
  permissions?: Record<string, string>
  'timeout-minutes'?: number | string
  env?: Record<string, string>
  steps?: Step[]
}

const source = fs.readFileSync(
  path.resolve(process.cwd(), '.github/workflows/data-pipeline.yml'),
  'utf-8'
)
const workflow = parse(source) as {
  permissions: Record<string, string>
  jobs: Record<string, Job>
}
const smoke = workflow.jobs['data-smoke']!
const job = workflow.jobs['data-auto-restore']
const steps = job?.steps ?? []
const byId = (id: string) => steps.find(s => s.id === id)
const idx = (id: string) => steps.findIndex(s => s.id === id)
const text = (s: Step | undefined) =>
  `${s?.if ?? ''}\n${s?.run ?? ''}\n${JSON.stringify(s?.env ?? {})}`

describe('data-smoke reports a verdict the restore can key off (#2537)', () => {
  it('exposes `unhealthy` as a job output, set before the job fails', () => {
    expect(smoke.outputs?.['unhealthy']).toMatch(
      /steps\.\w+\.outputs\.unhealthy/
    )
    const last = smoke.steps![smoke.steps!.length - 1]!
    expect(last.id).toBeTruthy()
    expect(last.run).toMatch(/unhealthy=true.*GITHUB_OUTPUT/)
    // the failure still comes after the output is written
    expect(last.run!.indexOf('GITHUB_OUTPUT')).toBeLessThan(
      last.run!.indexOf('exit 1')
    )
  })

  it('exposes when the published data was last written, for the restore window', () => {
    expect(smoke.outputs?.['window_end']).toBeTruthy()
  })

  it('exposes restore_eligible and why, from the classified verdict', () => {
    expect(smoke.outputs?.['restore_eligible']).toMatch(
      /steps\.verdict\.outputs\.restore_eligible/
    )
    expect(smoke.outputs?.['restore_reason']).toMatch(
      /steps\.verdict\.outputs\.restore_reason/
    )
    const last = smoke.steps![smoke.steps!.length - 1]!
    expect(last.id).toBe('verdict')
    expect(last.run).toMatch(/data-auto-restore\.ts\s+verdict/)
    // the verdict is written before the step fails the run
    expect(last.run!.indexOf('data-auto-restore.ts verdict')).toBeLessThan(
      last.run!.indexOf('exit 1')
    )
  })

  it('feeds the classifier the smoke result and the schema step flags', () => {
    const last = smoke.steps![smoke.steps!.length - 1]!
    const schema = smoke.steps!.find(s =>
      /check-cdn-schema\.ts/.test(s.run ?? '')
    )!
    expect(last.env?.['SMOKE_HEALTHY']).toContain('outputs.healthy')
    expect(last.env?.['SMOKE_RESULT_FILE']).toContain('outputs.result_file')
    expect(last.env?.['SCHEMA_UNHEALTHY']).toContain(
      `steps.${schema.id}.outputs.unhealthy`
    )
    expect(last.env?.['SCHEMA_RESTORE_ELIGIBLE']).toContain(
      `steps.${schema.id}.outputs.restore_eligible`
    )
  })

  it('the restore job keys its decision and its execute off restore_eligible', () => {
    for (const id of ['decide', 'report']) {
      expect(byId(id)?.env?.['RESTORE_ELIGIBLE'], id).toBe(
        '${{ needs.data-smoke.outputs.restore_eligible }}'
      )
      expect(byId(id)?.env?.['RESTORE_REASON'], id).toBe(
        '${{ needs.data-smoke.outputs.restore_reason }}'
      )
    }
    // belt and braces: the execute step itself also needs the flag
    expect(topLevelConjuncts(byId('execute')?.if ?? '')).toContain(
      "needs.data-smoke.outputs.restore_eligible == 'true'"
    )
  })

  it('keeps the promotion comment on the promote step: the window step sits before it', () => {
    const i = source.indexOf('# Promotion (#1763, ADR-015 P6)')
    const j = source.indexOf('- name: Promote run manifest to production')
    const k = source.indexOf('- name: Record the promotion window start')
    expect(i).toBeGreaterThan(-1)
    expect(k).toBeGreaterThan(-1)
    expect(k).toBeLessThan(i)
    expect(source.slice(i, j)).not.toMatch(/- name:/)
  })
})

describe('data-auto-restore job (#2537)', () => {
  it('exists and runs after the data smoke and the pipeline', () => {
    expect(job).toBeDefined()
    const needs = [job!.needs ?? []].flat()
    expect(needs).toContain('data-smoke')
    expect(needs).toContain('pipeline')
  })

  it('unhealthy -> plan runs: the job runs only on an unhealthy verdict', () => {
    expect(job!.if ?? '').toMatch(/^!cancelled\(\)/)
    const c = topLevelConjuncts(job!.if ?? '')
    expect(c).toContain("needs.data-smoke.outputs.unhealthy == 'true'")
  })

  it('healthy -> nothing runs: no way to reach a step without that verdict', () => {
    // A job-level gate on the verdict and no step `if` that is a bare
    // always()/!cancelled() without the job gate is enough: steps cannot
    // run when the job is skipped. Pin that the gate is a top-level AND, not
    // inside an OR that a healthy run could satisfy.
    expect(job!.if).not.toMatch(/\|\|/)
    expect(job!.if).not.toMatch(/always\(\)/)
  })

  it('never runs on a staging-only proof run', () => {
    expect(topLevelConjuncts(job!.if ?? '')).toContain(SKIP_CLAUSE_DOWNSTREAM)
  })

  it('adds no permissions of its own, and no new secrets', () => {
    expect(job!.permissions).toBeUndefined()
    expect(workflow.permissions).toEqual({
      contents: 'read',
      'id-token': 'write',
      issues: 'write',
    })
    const secrets = new Set(
      [...JSON.stringify(job).matchAll(/secrets\.(\w+)/g)].map(m => m[1])
    )
    expect([...secrets].sort()).toEqual([
      'GCP_SERVICE_ACCOUNT',
      'GCP_WORKLOAD_IDENTITY_PROVIDER',
    ])
  })

  it('authenticates with the same identity the promote jobs use', () => {
    const auth = steps.find(s =>
      (s.uses ?? '').startsWith('google-github-actions/auth@')
    )
    expect(auth?.with?.['service_account']).toBe(
      '${{ secrets.GCP_SERVICE_ACCOUNT }}'
    )
    expect(auth?.with?.['workload_identity_provider']).toBe(
      '${{ secrets.GCP_WORKLOAD_IDENTITY_PROVIDER }}'
    )
  })

  it('is bounded', () => {
    expect(Number(job!['timeout-minutes'])).toBeLessThanOrEqual(30)
  })

  it('nothing needs it, so it cannot hold or change a promotion', () => {
    for (const [name, j] of Object.entries(workflow.jobs)) {
      expect([j.needs ?? []].flat(), name).not.toContain('data-auto-restore')
    }
  })
})

describe('mode: dry-run by default, execute only by explicit variable', () => {
  it('the library default is not execute', () => {
    expect(DEFAULT_RESTORE_MODE).toBe('dry-run')
  })

  it('reads the mode from the DATA_AUTO_RESTORE repository variable only', () => {
    const all = JSON.stringify(workflow.jobs['data-auto-restore'])
    expect(all).toContain('${{ vars.DATA_AUTO_RESTORE }}')
    // never a literal value: no env assignment of execute anywhere
    expect(source).not.toMatch(/DATA_AUTO_RESTORE:\s*['"]?execute/)
    expect(source).not.toMatch(/DATA_AUTO_RESTORE=execute/)
    // not a dispatch input either: only a Ron-set variable turns it on
    expect(source).not.toMatch(/inputs\.data_auto_restore/i)
  })

  it('resolves the variable through the tested resolver', () => {
    const mode = byId('mode')
    expect(mode?.run ?? '').toMatch(/data-auto-restore\.ts\s+mode/)
    expect(mode?.env?.['DATA_AUTO_RESTORE']).toBe(
      '${{ vars.DATA_AUTO_RESTORE }}'
    )
  })

  it('the execute step needs the decision to say execute', () => {
    const execute = byId('execute')
    expect(execute).toBeDefined()
    const c = topLevelConjuncts(execute!.if ?? '')
    expect(c).toContain("steps.decide.outputs.execute == 'true'")
    expect(execute!.run).toMatch(/plan-data-restore\.ts\s+--execute/)
  })
})

describe('one planner, reused (#2539)', () => {
  it('plans with plan-data-restore.ts using the run window and manifest paths', () => {
    const plan = byId('plan')
    expect(plan?.run ?? '').toMatch(/plan-data-restore\.ts/)
    expect(plan!.run).toMatch(/--since\b/)
    expect(plan!.run).toMatch(/--until\b/)
    expect(plan!.run).toMatch(/--paths\b/)
    expect(plan!.run).toMatch(/--out\b/)
  })

  it('takes the window from the run itself: promote start and smoke end', () => {
    expect(workflow.jobs['pipeline']!.outputs?.['promote_started']).toBeTruthy()
    const plan = byId('plan')
    expect(JSON.stringify(plan!.env)).toContain(
      'needs.pipeline.outputs.promote_started'
    )
    expect(JSON.stringify(plan!.env)).toContain(
      'needs.data-smoke.outputs.window_end'
    )
  })

  it('takes the paths from the run manifest, not from a bucket listing', () => {
    const plan = byId('plan')
    expect(plan!.run).toMatch(/data-auto-restore\.ts\s+paths/)
    expect(plan!.run).toContain('runs/${GITHUB_RUN_ID}/written.jsonl')
  })

  it('has no second planner and never runs gcloud restore or rm itself', () => {
    const body = steps.map(s => s.run ?? '').join('\n')
    expect(body).not.toMatch(/storage\s+restore/)
    expect(body).not.toMatch(/storage\s+rm\b/)
    expect(body).not.toMatch(/storage\s+cp\b/)
    expect(body).not.toMatch(/--soft-deleted[^\n]*\|\s*(awk|jq)/)
    const scripts = new Set(
      [...body.matchAll(/scripts\/[\w/.-]+\.(?:ts|sh)/g)].map(m => m[0])
    )
    expect([...scripts].sort()).toEqual([
      'scripts/check-cdn-schema.ts',
      'scripts/data-auto-restore.ts',
      'scripts/pipeline/list-restore-candidates.sh',
      'scripts/plan-data-restore.ts',
    ])
  })

  it('the plan step never fails the job: a refusal must still reach the issue', () => {
    expect(byId('plan')?.['continue-on-error']).toBe(true)
  })

  it('is read-only until the execute step: no step before it writes prod', () => {
    const exec = idx('execute')
    for (const s of steps.slice(0, exec)) {
      expect(prodWriteReasons(s.run ?? '', s.env ?? {}), s.name).toEqual([])
    }
  })
})

describe('order and the refused path', () => {
  it('plan < decide < execute < purge < recheck < report < file the issue', () => {
    const issue = steps.findIndex(s => /gh issue create/.test(s.run ?? ''))
    const order = [
      idx('plan'),
      idx('decide'),
      idx('execute'),
      idx('purge'),
      idx('recheck'),
      idx('report'),
      issue,
    ]
    expect(order.every(i => i > -1)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  it('a refused plan: the decision refuses, the execute step is skipped, the issue still files', () => {
    const decide = byId('decide')
    expect(decide?.run).toMatch(/data-auto-restore\.ts\s+decide/)
    expect(decide?.['continue-on-error']).toBeUndefined()
    expect(decide!.if ?? '').toContain('!cancelled()')
    const issue = steps.find(s => /gh issue create/.test(s.run ?? ''))!
    // files whenever the job got that far, not only when the execute worked
    expect(issue.if ?? '').toContain('!cancelled()')
    expect(issue.if).toContain("steps.decide.outputs.file_issue == 'true'")
    expect(issue.if).not.toMatch(/steps\.execute\.outcome == 'success'/)
  })

  it('purge and recheck run after an execute that finished or failed part way, never when it was skipped', () => {
    // A partial restore has already changed prod, so the edge must be purged
    // and the data re-checked then too; a skipped execute changed nothing.
    for (const id of ['purge', 'recheck']) {
      const cond = byId(id)?.if ?? ''
      expect(cond, id).toContain("steps.execute.outcome == 'success'")
      expect(cond, id).toContain("steps.execute.outcome == 'failure'")
      expect(cond, id).not.toContain('skipped')
      expect(cond, id).not.toMatch(/steps\.execute\.outcome\s*!=/)
    }
    expect(text(byId('purge'))).toContain('invalidate-cdn-cache')
    expect(text(byId('recheck'))).toContain('check-cdn-schema.ts')
  })

  it('the issue body is built from the plan and attached as an artifact', () => {
    const report = byId('report')
    expect(report?.run).toMatch(/data-auto-restore\.ts\s+report/)
    expect(report!.if ?? '').toContain('!cancelled()')
    const upload = steps.find(s =>
      (s.uses ?? '').startsWith('actions/upload-artifact@')
    )
    expect(upload).toBeDefined()
    expect(upload!.if ?? '').toContain('!cancelled()')
    expect(upload!.with?.['path'] ?? '').toContain('plan.json')
  })

  it('files a data-rollback issue the way promotion-held and hosting-rollback do', () => {
    const run = steps.map(s => s.run ?? '').join('\n')
    expect(run).toMatch(/gh label create data-rollback/)
    expect(run).toMatch(/gh issue list --label data-rollback --state open/)
    expect(run).toMatch(/gh issue comment/)
    expect(run).toMatch(
      /gh issue create[^\n]*--label data-rollback|--label data-rollback/
    )
    const filing = steps.filter(s => /gh issue/.test(s.run ?? ''))
    for (const s of filing) {
      expect(s.env?.['GH_TOKEN'], s.name).toBe('${{ github.token }}')
    }
  })
})

describe('the skip_promotion guard sees the new prod writers (#1754)', () => {
  it('flags the execute step and the purge as prod writes', () => {
    expect(
      prodWriteReasons(
        'npx tsx scripts/plan-data-restore.ts --execute --plan p.json'
      )
    ).not.toEqual([])
    const found = findProdWriteSteps(
      workflow as unknown as Parameters<typeof findProdWriteSteps>[0]
    ).filter(s => s.job === 'data-auto-restore')
    expect(found.map(f => f.step).length).toBeGreaterThanOrEqual(2)
  })

  it('guards every one of them with the skip clause', () => {
    const found = findProdWriteSteps(
      workflow as unknown as Parameters<typeof findProdWriteSteps>[0]
    ).filter(s => s.job === 'data-auto-restore')
    expect(found.filter(f => !f.guarded)).toEqual([])
  })
})
