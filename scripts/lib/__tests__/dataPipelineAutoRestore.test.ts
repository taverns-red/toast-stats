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
  environment?: string | { name?: string }
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
// The restore is two jobs (#2537): a token-free decide job that files the
// issue, and an execute job, behind a protected environment, that alone mints
// the promote service account's token.
const decideJob = workflow.jobs['data-auto-restore-decide']
const dSteps = decideJob?.steps ?? []
const dById = (id: string) => dSteps.find(s => s.id === id)
const job = workflow.jobs['data-auto-restore-execute']
const steps = job?.steps ?? []
const restoreJobs = Object.entries(workflow.jobs).filter(([name]) =>
  name.startsWith('data-auto-restore')
)
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

describe('data-auto-restore-decide: token-free, files the issue (#2537)', () => {
  it('exists and runs after the data smoke and the pipeline', () => {
    expect(decideJob).toBeDefined()
    const needs = [decideJob!.needs ?? []].flat()
    expect(needs).toContain('data-smoke')
    expect(needs).toContain('pipeline')
  })

  it('unhealthy -> it runs; healthy -> nothing runs', () => {
    const cond = decideJob!.if ?? ''
    expect(cond).toMatch(/^!cancelled\(\)/)
    const c = topLevelConjuncts(cond)
    expect(c).toContain("needs.data-smoke.outputs.unhealthy == 'true'")
    expect(c).toContain(SKIP_CLAUSE_DOWNSTREAM)
    expect(cond).not.toMatch(/\|\|/)
    expect(cond).not.toMatch(/always\(\)/)
  })

  it('holds the least scope that files an issue: contents read, issues write, no id-token', () => {
    expect(decideJob!.permissions).toEqual({
      contents: 'read',
      issues: 'write',
    })
  })

  it('mints no token and makes no GCP call: no auth step, no secrets, no gcloud, no bucket', () => {
    const all = JSON.stringify(decideJob)
    expect(all).not.toMatch(/google-github-actions/)
    expect(all).not.toMatch(/secrets\./)
    expect(all).not.toMatch(/gcloud|gsutil|setup-gcloud/)
    expect(all).not.toMatch(/plan-data-restore\.ts|list-restore-candidates/)
    expect(all).not.toMatch(/GCS_BUCKET|PROD_BUCKET/)
    expect(decideJob!.environment).toBeUndefined()
  })

  it('has no prod-writing step the skip_promotion guard would have to find', () => {
    const found = findProdWriteSteps(
      workflow as unknown as Parameters<typeof findProdWriteSteps>[0]
    ).filter(s => s.job === 'data-auto-restore-decide')
    expect(found).toEqual([])
  })

  it('decides from the data-smoke verdict only, through the tested CLI', () => {
    const intent = dById('intent')
    expect(intent?.run ?? '').toMatch(/data-auto-restore\.ts\s+intent/)
    expect(intent!.env?.['DATA_AUTO_RESTORE']).toBe(
      '${{ vars.DATA_AUTO_RESTORE }}'
    )
    expect(intent!.env?.['RESTORE_ELIGIBLE']).toBe(
      '${{ needs.data-smoke.outputs.restore_eligible }}'
    )
    expect(intent!.env?.['RESTORE_REASON']).toBe(
      '${{ needs.data-smoke.outputs.restore_reason }}'
    )
    expect(intent!.env?.['UNHEALTHY']).toBe(
      '${{ needs.data-smoke.outputs.unhealthy }}'
    )
  })

  it('outputs the decision for the execute job: execute and the issue number', () => {
    expect(decideJob!.outputs?.['execute']).toBe(
      '${{ steps.intent.outputs.execute }}'
    )
    expect(decideJob!.outputs?.['issue_number']).toMatch(
      /steps\.\w+\.outputs\.issue_number/
    )
  })

  it('files the data-rollback issue the way promotion-held and hosting-rollback do', () => {
    const run = dSteps.map(s => s.run ?? '').join('\n')
    expect(run).toMatch(/gh label create data-rollback/)
    expect(run).toMatch(/gh issue list --label data-rollback --state open/)
    expect(run).toMatch(/gh issue comment/)
    expect(run).toMatch(
      /gh issue create[^\n]*--label data-rollback|--label data-rollback/
    )
    const filing = dSteps.filter(s => /gh issue/.test(s.run ?? ''))
    expect(filing.length).toBeGreaterThan(0)
    for (const s of filing) {
      expect(s.env?.['GH_TOKEN'], s.name).toBe('${{ github.token }}')
      expect(s.if ?? '', s.name).toContain(
        "steps.intent.outputs.file_issue == 'true'"
      )
    }
  })

  it('is bounded, and nothing but the execute job needs it', () => {
    expect(Number(decideJob!['timeout-minutes'])).toBeLessThanOrEqual(10)
    for (const [name, j] of Object.entries(workflow.jobs)) {
      if (name === 'data-auto-restore-execute') continue
      expect([j.needs ?? []].flat(), name).not.toContain(
        'data-auto-restore-decide'
      )
    }
  })
})

describe('data-auto-restore-execute: the only job that mints the write token (#2537)', () => {
  it('needs the decision and the data smoke', () => {
    expect(job).toBeDefined()
    const needs = [job!.needs ?? []].flat()
    for (const n of ['pipeline', 'data-smoke', 'data-auto-restore-decide']) {
      expect(needs).toContain(n)
    }
  })

  it('runs only on main, only on a decided execute, only when eligible, failing closed', () => {
    const cond = job!.if ?? ''
    expect(cond).toMatch(/^!cancelled\(\)/)
    const c = topLevelConjuncts(cond)
    expect(c).toContain(
      "needs.data-auto-restore-decide.outputs.execute == 'true'"
    )
    expect(c).toContain("needs.data-smoke.outputs.restore_eligible == 'true'")
    expect(c).toContain("github.ref == 'refs/heads/main'")
    expect(c).toContain(SKIP_CLAUSE_DOWNSTREAM)
    // a failed issue step after execute=true must not let execute run under
    // !cancelled(): the decide job has to have succeeded
    expect(c).toContain("needs.data-auto-restore-decide.result == 'success'")
    // equality with the literal 'true' fails closed on an empty output; no
    // `!= 'false'` style test, no OR a wrong branch could satisfy
    expect(cond).not.toMatch(/\|\|/)
    expect(cond).not.toMatch(/always\(\)/)
    for (const conj of c.filter(x =>
      /outputs\.(execute|restore_eligible)/.test(x)
    )) {
      expect(conj).toMatch(/ == 'true'$/)
    }
  })

  it('is bound to the data-restore environment, which Ron creates with a main-only policy', () => {
    const env =
      typeof job!.environment === 'string'
        ? job!.environment
        : job!.environment?.name
    expect(env).toBe('data-restore')
  })

  it('carries its own scope: contents read, id-token and issues write', () => {
    expect(job!.permissions).toEqual({
      contents: 'read',
      'id-token': 'write',
      issues: 'write',
    })
  })

  it('authenticates with the same identity the promote jobs use, and no new secret', () => {
    const auth = steps.find(s =>
      (s.uses ?? '').startsWith('google-github-actions/auth@')
    )
    expect(auth?.with?.['service_account']).toBe(
      '${{ secrets.GCP_SERVICE_ACCOUNT }}'
    )
    expect(auth?.with?.['workload_identity_provider']).toBe(
      '${{ secrets.GCP_WORKLOAD_IDENTITY_PROVIDER }}'
    )
    const secrets = new Set(
      [...JSON.stringify(job).matchAll(/secrets\.(\w+)/g)].map(m => m[1])
    )
    expect([...secrets].sort()).toEqual([
      'GCP_SERVICE_ACCOUNT',
      'GCP_WORKLOAD_IDENTITY_PROVIDER',
    ])
  })

  it('is the only restore job with an auth step or a secret', () => {
    expect(restoreJobs.map(([n]) => n).sort()).toEqual([
      'data-auto-restore-decide',
      'data-auto-restore-execute',
    ])
    for (const [name, j] of restoreJobs) {
      const has = /google-github-actions\/auth@|secrets\./.test(
        JSON.stringify(j)
      )
      expect(has, name).toBe(name === 'data-auto-restore-execute')
    }
  })

  it('does the listing, planning, restore, purge and recheck, and nothing else touches them', () => {
    for (const [name, j] of restoreJobs) {
      const body = (j.steps ?? []).map(s => s.run ?? '').join('\n')
      const touches =
        /plan-data-restore\.ts|invalidate-cdn-cache|list-restore-candidates/.test(
          body
        )
      expect(touches, name).toBe(name === 'data-auto-restore-execute')
    }
  })

  it('is bounded', () => {
    expect(Number(job!['timeout-minutes'])).toBeLessThanOrEqual(30)
  })

  it('nothing needs it, so it cannot hold or change a promotion', () => {
    for (const [name, j] of Object.entries(workflow.jobs)) {
      expect([j.needs ?? []].flat(), name).not.toContain(
        'data-auto-restore-execute'
      )
    }
  })
})

describe('mode: dry-run by default, execute only by explicit variable', () => {
  it('the library default is not execute', () => {
    expect(DEFAULT_RESTORE_MODE).toBe('dry-run')
  })

  it('reads the mode from the DATA_AUTO_RESTORE repository variable only', () => {
    for (const j of [decideJob, job]) {
      expect(JSON.stringify(j)).toContain('${{ vars.DATA_AUTO_RESTORE }}')
    }
    // never a literal value: no env assignment of execute anywhere
    expect(source).not.toMatch(/DATA_AUTO_RESTORE:\s*['"]?execute/)
    expect(source).not.toMatch(/DATA_AUTO_RESTORE=execute/)
    // not a dispatch input either: only a Ron-set variable turns it on
    expect(source).not.toMatch(/inputs\.data_auto_restore/i)
  })

  it('resolves the variable through the tested resolver, in the decision and again at execute', () => {
    expect(dById('intent')?.run ?? '').toMatch(/data-auto-restore\.ts\s+intent/)
    expect(byId('decide')?.run ?? '').toMatch(/data-auto-restore\.ts\s+decide/)
    expect(byId('decide')?.env?.['DATA_AUTO_RESTORE']).toBe(
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
  it('plan < decide < execute < purge < recheck < report < comment on the issue', () => {
    const issue = steps.findIndex(s => /gh issue comment/.test(s.run ?? ''))
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
    const issue = steps.find(s => /gh issue comment/.test(s.run ?? ''))!
    // comments the enumerated plan whenever the job got that far, not only
    // when the execute worked; the issue itself was filed by the decide job
    expect(issue.if ?? '').toContain('!cancelled()')
    expect(issue.if).not.toMatch(/steps\.execute\.outcome == 'success'/)
    expect(issue.env?.['GH_TOKEN']).toBe('${{ github.token }}')
    expect(issue.env?.['ISSUE_NUMBER']).toBe(
      '${{ needs.data-auto-restore-decide.outputs.issue_number }}'
    )
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

  it('the execute job only comments the enumerated plan: it never opens the issue itself', () => {
    const run = steps.map(s => s.run ?? '').join('\n')
    expect(run).toMatch(/gh issue comment/)
    expect(run).not.toMatch(/gh issue create/)
    expect(run).not.toMatch(/gh label create/)
  })

  it('the decide job posts no object list: only the manifest path and the manual plan command', () => {
    const intent = dById('intent')
    expect(intent?.run ?? '').not.toMatch(/plan-data-restore/)
    expect(dSteps.map(s => s.run ?? '').join('\n')).not.toMatch(
      /--paths|\.jsonl/
    )
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
    ).filter(s => s.job === 'data-auto-restore-execute')
    expect(found.map(f => f.step).length).toBeGreaterThanOrEqual(2)
  })

  it('guards every one of them with the skip clause', () => {
    const found = findProdWriteSteps(
      workflow as unknown as Parameters<typeof findProdWriteSteps>[0]
    ).filter(s => s.job === 'data-auto-restore-execute')
    expect(found.filter(f => !f.guarded)).toEqual([])
  })
})
