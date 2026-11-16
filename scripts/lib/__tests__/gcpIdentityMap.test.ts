/**
 * #2872: every workflow job that authenticates to GCP maps to exactly ONE
 * identity variable, recorded in EXPECTED below.
 *
 * Fails when:
 * - a job authenticates to GCP and is not in EXPECTED (unclassified);
 * - a job authenticates with two different identities;
 * - an EXPECTED entry matches no authenticating job (stale entry);
 * - a job's identity differs from its entry.
 *
 * HOW TO UPDATE: each B-PR of #2872 changes the identity variable of the jobs
 * it moves. Edit the value in EXPECTED (key is `<workflow file>::<job id>`) in
 * the same PR as the workflow change.
 *
 * Identity variables seen today:
 * - DEPLOYER: `secrets.GCP_SERVICE_ACCOUNT`, the single shared deploy identity.
 * - DATA_READER: `vars.GCP_DATA_READER_SA`, the read-only identity (#2866).
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { parse } from 'yaml'

const DEPLOYER = 'secrets.GCP_SERVICE_ACCOUNT'
const DATA_READER = 'vars.GCP_DATA_READER_SA'

export const EXPECTED: Record<string, string> = {
  'basemap-build.yml::basemap': DEPLOYER,
  'contact-strip.yml::strip': DEPLOYER,
  'data-pipeline.yml::pipeline': DEPLOYER,
  'data-pipeline.yml::closing-registry-pr': DEPLOYER,
  'data-pipeline.yml::daily-reports': DEPLOYER,
  'data-pipeline.yml::place-reports': DEPLOYER,
  'data-pipeline.yml::education-rollup': DEPLOYER,
  'data-pipeline.yml::promote-reports': DEPLOYER,
  'data-pipeline.yml::data-auto-restore-decide': DATA_READER,
  'data-pipeline.yml::data-auto-restore-execute': DEPLOYER,
  'data-pipeline.yml::og-cards': DEPLOYER,
  'data-pipeline.yml::education-ledger-history': DEPLOYER,
  'deploy.yml::deploy-frontend': DEPLOYER,
  'education-timeline-backfill.yml::backfill': DEPLOYER,
  'gap-district-prune.yml::prune': DEPLOYER,
  'harness-staging-canary.yml::canary': DEPLOYER,
  'pr-preview-cleanup.yml::cleanup': DEPLOYER,
  'pr-preview.yml::preview': DEPLOYER,
  'validate-vs-ceo-report.yml::validate': DEPLOYER,
  'videos-publish.yml::publish': DEPLOYER,
}

const WORKFLOWS = path.resolve(process.cwd(), '.github/workflows')
const AUTH_ACTION = /^google-github-actions\/auth(@|$)/

interface Step {
  uses?: string
  with?: Record<string, unknown>
}
interface Workflow {
  jobs?: Record<string, { steps?: Step[] }>
}

/** `${{ secrets.X }}` or `${{ vars.X }}` -> `secrets.X` / `vars.X`. */
const identityOf = (v: unknown): string => {
  const m = /^\s*\$\{\{\s*(.*?)\s*\}\}\s*$/.exec(String(v ?? ''))
  return m ? m[1] : String(v ?? '<missing>')
}

/** key `<file>::<job>` -> set of service_account values used by auth steps. */
const collect = (): Map<string, Set<string>> => {
  const out = new Map<string, Set<string>>()
  for (const file of fs.readdirSync(WORKFLOWS).sort()) {
    if (!/\.ya?ml$/.test(file)) continue
    const wf = parse(
      fs.readFileSync(path.join(WORKFLOWS, file), 'utf-8')
    ) as Workflow
    for (const [job, def] of Object.entries(wf.jobs ?? {})) {
      for (const step of def.steps ?? []) {
        if (!step.uses || !AUTH_ACTION.test(step.uses)) continue
        const key = `${file}::${job}`
        const set = out.get(key) ?? new Set<string>()
        set.add(identityOf(step.with?.service_account))
        out.set(key, set)
      }
    }
  }
  return out
}

describe('GCP identity map (#2872)', () => {
  const found = collect()

  it('classifies every GCP-authenticating job', () => {
    const unclassified = [...found.keys()].filter(k => !(k in EXPECTED))
    expect(unclassified).toEqual([])
  })

  it('uses exactly one identity per job', () => {
    const multi = [...found].filter(([, ids]) => ids.size !== 1).map(([k]) => k)
    expect(multi).toEqual([])
  })

  it('has no table entry without a matching job', () => {
    const stale = Object.keys(EXPECTED).filter(k => !found.has(k))
    expect(stale).toEqual([])
  })

  it('matches each job to its expected identity variable', () => {
    const actual = Object.fromEntries(
      [...found].map(([k, ids]) => [k, [...ids][0]])
    )
    const comparable = Object.fromEntries(
      Object.keys(EXPECTED)
        .filter(k => k in actual)
        .map(k => [k, actual[k]])
    )
    const expected = Object.fromEntries(
      Object.entries(EXPECTED).filter(([k]) => k in actual)
    )
    expect(comparable).toEqual(expected)
  })
})
