/**
 * Workflow guard: every job runs on one explicit, reviewed runner label (#1740).
 *
 * `ubuntu-latest` moves to Ubuntu 26.04 between 2026-10-19 and 2026-11-19
 * (actions/runner-images#14748), job by job, with no PR in this repo having
 * proven the new image. Same class as setup-gcloud's frozen `latest` (#1702,
 * #1720): a floating label is an unreviewed dependency. So every `runs-on:`
 * names the image explicitly, and all jobs agree on it. Moving to the next
 * image is a deliberate edit of RUNNER below, proven by PR CI.
 *
 * Sourced from the workflow YAML so the guard cannot drift from the jobs.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { parse } from 'yaml'

const WORKFLOW_DIR = path.resolve(process.cwd(), '.github/workflows')

/** The one runner image every job uses. Bump deliberately, prove in PR CI. */
const RUNNER = 'ubuntu-26.04'

interface JobSite {
  file: string
  job: string
  runsOn: unknown
}

/** Why `runsOn` is not acceptable, or null when it is. */
function labelViolation(runsOn: unknown): string | null {
  if (runsOn === undefined || runsOn === null) return 'no `runs-on:`'
  if (typeof runsOn !== 'string') {
    return `\`runs-on: ${JSON.stringify(runsOn)}\` is not a single label`
  }
  if (/-latest$/.test(runsOn)) {
    return `\`runs-on: ${runsOn}\` floats with GitHub's rollout`
  }
  if (runsOn !== RUNNER) {
    return `\`runs-on: ${runsOn}\` differs from the reviewed ${RUNNER}`
  }
  return null
}

function jobSites(): JobSite[] {
  const out: JobSite[] = []
  for (const file of fs.readdirSync(WORKFLOW_DIR)) {
    if (!/\.ya?ml$/.test(file)) continue
    const wf = parse(
      fs.readFileSync(path.join(WORKFLOW_DIR, file), 'utf-8')
    ) as { jobs?: Record<string, { 'runs-on'?: unknown; uses?: string }> }
    for (const [job, def] of Object.entries(wf.jobs ?? {})) {
      // A reusable-workflow call has no runner of its own.
      if (def.uses) continue
      out.push({ file, job, runsOn: def['runs-on'] })
    }
  }
  return out
}

describe('labelViolation', () => {
  it.each([
    [undefined],
    ['ubuntu-latest'],
    ['ubuntu-24.04'],
    ['ubuntu-22.04'],
    [['self-hosted', 'linux']],
    ['${{ matrix.os }}'],
  ])('rejects %s', v => {
    expect(labelViolation(v)).not.toBeNull()
  })

  it(`accepts ${RUNNER}`, () => {
    expect(labelViolation(RUNNER)).toBeNull()
  })
})

describe('workflow runner labels (#1740)', () => {
  const sites = jobSites()

  it('finds the jobs (guard is not vacuous)', () => {
    expect(sites.length).toBeGreaterThanOrEqual(19)
    // pipeline, closing-registry-pr, daily-reports, place-reports,
    // education-ledger-history (#1802), education-rollup (#2028).
    expect(sites.filter(s => s.file === 'data-pipeline.yml').length).toBe(6)
  })

  it(`runs every job on the explicit ${RUNNER} label`, () => {
    const bad = sites
      .map(s => ({ s, why: labelViolation(s.runsOn) }))
      .filter(x => x.why !== null)
      .map(x => `${x.s.file} job ${x.s.job}: ${x.why}`)
    expect(bad).toEqual([])
  })
})
