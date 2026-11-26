/**
 * Workflow contract: the staging restore drill (#3019, #2858, #2856).
 *
 * A dispatch-only workflow that runs the data-auto-restore decide job's
 * read-only plan against the STAGING data bucket, as the read-only data
 * reader, and comments the enumerated plan on the issues it is given. It has
 * no execute job, so the restore identity and every write are out of reach.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { parse } from 'yaml'
import { prodWriteReasons, topLevelConjuncts } from '../prodWriteGuard.js'
import { DATA_READER, EXPECTED } from '../gcpIdentityMap.js'
import { buildDecisionIssueBody } from '../dataAutoRestore.js'

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
  environment?: unknown
  needs?: string | string[]
  outputs?: Record<string, string>
  permissions?: Record<string, string>
  'timeout-minutes'?: number | string
  steps?: Step[]
}
interface Workflow {
  on?: Record<string, unknown>
  concurrency?: { group?: string }
  permissions?: Record<string, string>
  env?: Record<string, string>
  jobs?: Record<string, Job>
}

const STAGING = 'toast-stats-data-staging'
const PROD = 'toast-stats-data-ca'
const WORKFLOWS = path.join(__dirname, '..', '..', '..', '.github', 'workflows')
const file = path.join(WORKFLOWS, 'data-restore-drill.yml')
const source = fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : ''
const wf = (source ? parse(source) : {}) as Workflow
const jobs = Object.entries(wf.jobs ?? {})
const drill = wf.jobs?.['drill']
const steps = drill?.steps ?? []
const byId = (id: string) => steps.find(s => s.id === id)
const authSteps = steps.filter(s =>
  (s.uses ?? '').startsWith('google-github-actions/auth@')
)
const runs = steps.map(s => s.run ?? '').join('\n')

/** The conjuncts every step after the two guards must carry (B1). */
const GATE = [
  "github.ref == 'refs/heads/main'",
  "steps.ref.outcome == 'success'",
  "steps.inputcheck.outcome == 'success'",
]
const unwrap = (v: unknown): string =>
  String(v ?? '')
    .replace(/^\s*\$\{\{([\s\S]*)\}\}\s*$/, '$1')
    .trim()

const pipeline = parse(
  fs.readFileSync(path.join(WORKFLOWS, 'data-pipeline.yml'), 'utf-8')
) as Workflow
const decide = pipeline.jobs!['data-auto-restore-decide']!
const decideSteps = decide.steps ?? []

const scriptsIn = (text: string) =>
  [
    ...new Set(
      [...text.matchAll(/scripts\/[\w/.-]+\.(?:ts|sh)/g)].map(m => m[0])
    ),
  ].sort()

describe('data-restore-drill.yml: dispatch only (#3019)', () => {
  it('exists', () => {
    expect(source).not.toBe('')
  })

  it('is triggered by workflow_dispatch and nothing else', () => {
    expect(Object.keys(wf.on ?? {})).toEqual(['workflow_dispatch'])
  })

  it('has one job, the drill, and no execute job', () => {
    expect(jobs.map(([n]) => n)).toEqual(['drill'])
    expect(source).not.toMatch(/data-auto-restore-execute/)
  })

  it('never queues in the pipeline concurrency group, so it cannot displace a pending daily', () => {
    expect(wf.concurrency?.group).toBeTruthy()
    expect(wf.concurrency?.group).not.toBe('data-pipeline')
  })

  it('never interpolates a dispatch input into a shell script', () => {
    for (const s of steps) {
      expect(s.run ?? '', s.name).not.toMatch(
        /\$\{\{\s*(github\.event\.)?inputs\./
      )
    }
  })
})

describe('data-restore-drill.yml: only as the read-only data reader (#3019)', () => {
  it('holds the decide job permissions exactly, and read-only at the workflow level', () => {
    expect(wf.permissions).toEqual({ contents: 'read' })
    expect(drill?.permissions).toEqual(decide.permissions)
    expect(drill?.permissions).toEqual({
      contents: 'read',
      'id-token': 'write',
      issues: 'write',
    })
  })

  it('declares no environment, so the reader binding sees the main-branch subject', () => {
    expect(drill).toBeDefined()
    expect(drill!.environment).toBeUndefined()
  })

  it('authenticates once, as the data reader, through the shared provider', () => {
    expect(authSteps).toHaveLength(1)
    expect(authSteps[0]!.with?.['service_account']).toBe(
      '${{ vars.GCP_DATA_READER_SA }}'
    )
    expect(authSteps[0]!.with?.['workload_identity_provider']).toBe(
      '${{ secrets.GCP_WORKLOAD_IDENTITY_PROVIDER }}'
    )
    expect(authSteps[0]!.uses).toBe(
      decideSteps.find(s =>
        (s.uses ?? '').startsWith('google-github-actions/auth@')
      )!.uses
    )
  })

  it('names no other identity and no secret but the provider', () => {
    for (const v of [
      'GCP_RESTORE_SA',
      'GCP_PIPELINE_SA',
      'GCP_SERVICE_ACCOUNT',
      'GCP_MEDIA_SA',
      'GCP_PREVIEW_SA',
      'GCP_HOSTING_DEPLOY_SA',
    ]) {
      expect(source, v).not.toContain(v)
    }
    const secrets = new Set(
      [...source.matchAll(/secrets\.(\w+)/g)].map(m => m[1])
    )
    expect([...secrets]).toEqual(['GCP_WORKLOAD_IDENTITY_PROVIDER'])
  })

  it('is mapped to the data reader in the identity table', () => {
    expect(EXPECTED['data-restore-drill.yml::drill']).toBe(DATA_READER)
  })

  it('checks the ref first of all, before checkout or npm ci, on every run', () => {
    const ref = steps[0]
    expect(ref?.id).toBe('ref')
    // No `if`: it must run (and succeed) on main for the gate below to open.
    expect(ref?.if).toBeUndefined()
    expect(ref?.env?.['REF']).toBe('${{ github.ref }}')
    expect(ref?.run ?? '').toMatch(/"\$\{REF\}" != "refs\/heads\/main"/)
    expect(ref?.run ?? '').toMatch(/exit 1/)
  })

  it('checks the inputs second, before checkout or npm ci', () => {
    const check = steps[1]
    expect(check?.id).toBe('inputcheck')
    expect(check?.if).toBeUndefined()
    expect(check?.run ?? '').toMatch(/exit 1/)
  })

  it('gates every later step on main and both guards succeeding, so a failed guard stops everything (B1)', () => {
    const later = steps.slice(2)
    expect(later.length).toBeGreaterThan(0)
    const ungated = later
      .filter(s => {
        const c = topLevelConjuncts(unwrap(s.if))
        return !GATE.every(g => c.includes(g))
      })
      .map(s => s.name)
    expect(ungated).toEqual([])
  })

  it('splits the report issues into an array and checks each is a number before commenting', () => {
    const comment = steps.find(s => /gh issue comment/.test(s.run ?? ''))
    const run = comment?.run ?? ''
    expect(run).not.toMatch(/for \w+ in \$\{?REPORT_ISSUES/)
    expect(run).toMatch(/read -r -a \w+/)
    expect(run).toMatch(/\[\[ "\$\{n\}" =~ \^\[0-9\]\+\$ \]\]/)
    expect(run).toMatch(/gh issue comment "\$\{n\}"/)
  })

  it('fails before auth when the reader variable is empty', () => {
    const pre = byId('reader')
    expect(pre).toBeDefined()
    expect(pre!.env?.['READER_SA']).toBe('${{ vars.GCP_DATA_READER_SA }}')
    expect(pre!.run ?? '').toMatch(/-z\s+"\$\{?READER_SA\}?"/)
    expect(steps.indexOf(pre!)).toBeLessThan(steps.indexOf(authSteps[0]!))
  })
})

describe('data-restore-drill.yml: only against staging (#3019)', () => {
  it('never names the prod bucket', () => {
    expect(source).not.toContain(PROD)
    expect(source).not.toContain('GCS_BUCKET_PRODUCTION')
  })

  it('pins the bucket the planner lists to staging, as a literal', () => {
    expect(wf.env?.['GCS_BUCKET']).toBe(STAGING)
    const enumerate = byId('enumerate')
    expect(enumerate).toBeDefined()
    expect(enumerate!.env?.['PROD_BUCKET']).toBe(STAGING)
    expect(enumerate!.run).toMatch(/list-restore-candidates\.sh/)
  })

  it('never sets a bucket variable to anything but the staging literal, at any level (N3)', () => {
    const envs: Array<[string, Record<string, string> | undefined]> = [
      ['workflow', wf.env],
      ...jobs.map(
        ([n, j]) =>
          [`job ${n}`, (j as { env?: Record<string, string> }).env] as [
            string,
            Record<string, string> | undefined,
          ]
      ),
      ...steps.map(
        s =>
          [`step ${s.name}`, s.env] as [
            string,
            Record<string, string> | undefined,
          ]
      ),
    ]
    const bad: string[] = []
    for (const [where, env] of envs) {
      for (const [k, v] of Object.entries(env ?? {})) {
        if (/BUCKET/.test(k) && v !== STAGING) bad.push(`${where}: ${k}=${v}`)
      }
    }
    expect(bad).toEqual([])
  })

  it('reads the source run manifest and removal record from staging, never this run', () => {
    const run = byId('enumerate')!.run ?? ''
    expect(run).toContain(
      'gs://${GCS_BUCKET}/runs/${SOURCE_RUN_ID}/written.jsonl'
    )
    expect(run).toMatch(
      /read-prod-removals\.sh "\$\{GCS_BUCKET\}" "\$\{SOURCE_RUN_ID\}"/
    )
    expect(run).not.toContain('GITHUB_RUN_ID')
  })
})

describe('data-restore-drill.yml: only the plan, execute unreachable (#3019)', () => {
  it('runs the same scripts as the decide job, the planner without --execute', () => {
    const decideRuns = decideSteps.map(s => s.run ?? '').join('\n')
    expect(scriptsIn(runs)).toEqual(scriptsIn(decideRuns))
    expect(source).not.toContain('--execute')
    expect(byId('enumerate')!.run).toMatch(/plan-data-restore\.ts/)
  })

  it('has no write: no gcloud write verb, restore, purge or prod write anywhere', () => {
    expect(runs).not.toMatch(/storage\s+(restore|rm|cp|mv|rsync)\b/)
    expect(runs).not.toMatch(/storage\s+objects\s+(update|compose)\b/)
    expect(runs).not.toMatch(/storage\s+buckets\b/)
    expect(runs).not.toMatch(/\bgsutil\b/)
    expect(runs).not.toMatch(/invalidate-cdn-cache/)
    for (const s of steps) {
      expect(prodWriteReasons(s.run ?? '', s.env ?? {}), s.name).toEqual([])
    }
  })

  it('decides with a literal dry-run mode and a non-executable run mode, never the repository variable', () => {
    const intent = byId('intent')
    expect(intent).toBeDefined()
    expect(intent!.run).toMatch(/data-auto-restore\.ts\s+intent/)
    expect(intent!.env?.['DATA_AUTO_RESTORE']).toBe('dry-run')
    expect(intent!.env?.['RUN_MODE']).toBe('drill')
    expect(source).not.toContain('vars.DATA_AUTO_RESTORE')
    expect(intent!.run ?? '').not.toMatch(/plan-data-restore|gcloud/)
  })

  it('exposes no outputs a later job could key an execute off', () => {
    for (const [name, j] of jobs) {
      expect(j.outputs, name).toBeUndefined()
      expect(j.needs, name).toBeUndefined()
    }
  })

  it('comments the plan on the given issues, and never files or labels a data-rollback issue', () => {
    expect(runs).toMatch(/gh issue comment/)
    expect(runs).not.toMatch(/gh issue create/)
    expect(runs).not.toMatch(/gh label create/)
    expect(runs).not.toMatch(/data-rollback/)
  })

  it('attaches the full plan under the artifact name the comment body gives (N1)', () => {
    const upload = steps.find(s =>
      (s.uses ?? '').startsWith('actions/upload-artifact@')
    )
    const name = upload?.with?.['name'] ?? '<none>'
    // The shared CLI's body, as a real failure gets it.
    const body = buildDecisionIssueBody({
      mode: 'dry-run',
      decision: {
        action: 'dry-run',
        execute: false,
        fileIssue: true,
        reason: 'r',
      },
      runId: '1',
      runUrl: 'u',
      failed: 'f',
      stagingBucket: STAGING,
      prodBucket: PROD,
      promoteStarted: '',
      windowEnd: '',
      enumeration: {
        kind: 'plan',
        plan: {
          version: 1,
          bucket: STAGING,
          since: '2026-11-26T10:00:00Z',
          until: '2026-11-26T11:00:00Z',
          entries: [],
          refused: 0,
        },
      },
    })
    expect(body).toContain(`\`${name}\``)
    expect(upload?.with?.['path'] ?? '').toContain('plan.json')
  })

  it('says in the header that the decision is the drill fixed dry-run and prod auto-restore is unchanged (N2)', () => {
    const comment = steps.find(s => /gh issue comment/.test(s.run ?? ''))
    expect(comment?.run ?? '').toMatch(/fixed dry-run/)
    expect(comment?.run ?? '').toMatch(/auto-restore setting is unchanged/)
  })

  it('is bounded', () => {
    expect(Number(drill?.['timeout-minutes'])).toBeLessThanOrEqual(10)
  })
})
