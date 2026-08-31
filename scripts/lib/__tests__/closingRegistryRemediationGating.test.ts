/**
 * Closing-registry remediation gating guard for data-pipeline.yml (#1419).
 *
 * The alert re-fired daily for 19 days because the check was detect-only. The
 * fix routes staleness by remediation owner ('none' | 'auto' | 'manual'), and
 * that routing lives almost entirely in workflow `if:` expressions — the one
 * part of the change TypeScript unit tests cannot reach.
 *
 * The hazard this guard exists for: it is trivially easy to leave a state
 * where an open `closing-registry-stale` issue is neither refreshed, nor
 * linked to the auto-PR, nor closed — the alert goes silent while the registry
 * stays stale, which is strictly worse than the daily nag it replaced. These
 * assertions are sourced from the workflow YAML itself so they cannot drift
 * from the real steps.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { parse } from 'yaml'

const WORKFLOW_PATH = path.resolve(
  process.cwd(),
  '.github/workflows/data-pipeline.yml'
)

interface Step {
  name?: string
  id?: string
  if?: string
  run?: string
  with?: Record<string, unknown>
}

interface Job {
  if?: string
  needs?: string | string[]
  permissions?: Record<string, string>
  outputs?: Record<string, string>
  steps?: Step[]
}

function loadWorkflow(): {
  permissions?: Record<string, string>
  jobs: Record<string, Job>
} {
  return parse(fs.readFileSync(WORKFLOW_PATH, 'utf-8'))
}

const wf = loadWorkflow()
const pipeline = wf.jobs.pipeline!
const prJob = wf.jobs['closing-registry-pr']!

function stepNamed(job: Job, fragment: string): Step {
  const step = (job.steps ?? []).find(s => s.name?.includes(fragment))
  expect(
    step,
    `no step whose name contains ${JSON.stringify(fragment)}`
  ).toBeDefined()
  return step!
}

/**
 * The step's runnable shell, with `#` comment lines stripped.
 *
 * Comments in these steps explain the very footguns being asserted against
 * ("NOT --force-with-lease, because…"), so a naive substring check on the raw
 * `run:` matches the prose and reports a passing config as broken.
 */
function shellOf(step: Step): string {
  return (step.run ?? '')
    .split('\n')
    .filter(line => !/^\s*#/.test(line))
    .join('\n')
}

describe('closing-registry remediation gating (#1419)', () => {
  it('exposes the check verdict as a job output the PR job can read', () => {
    expect(pipeline.outputs?.registry_remediation).toContain(
      'steps.registrycheck.outputs.remediation'
    )
  })

  it('files the red issue on manual only — never on a derivable gap', () => {
    // The #1419 regression in one assertion: gating the red alert on
    // `stale == 'true'` re-nags daily for work the pipeline can do itself.
    for (const fragment of [
      'Ensure closing-registry-stale label exists',
      'File or refresh closing-registry-stale issue',
    ]) {
      const cond = stepNamed(pipeline, fragment).if ?? ''
      expect(cond).toContain(
        "steps.registrycheck.outputs.remediation == 'manual'"
      )
      expect(cond).not.toContain("outputs.stale == 'true'")
    }
  })

  it('still auto-closes the alert the moment the registry reads fresh', () => {
    const cond =
      stepNamed(pipeline, 'Auto-close closing-registry-stale issue').if ?? ''
    expect(cond).toContain("steps.registrycheck.outputs.stale == 'false'")
  })

  it('runs the auto-PR job only on an auto verdict', () => {
    // Non-daily modes never run `registrycheck`, so the output is '' and this
    // gate skips — the R17 "explicit outcome for every value" requirement.
    expect(prJob.if).toBe(
      "needs.pipeline.outputs.registry_remediation == 'auto'"
    )
    expect(prJob.needs).toBe('pipeline')
  })

  it('keeps write scopes off the scraping job and on the PR job only', () => {
    expect(wf.permissions?.contents).toBe('read')
    expect(prJob.permissions?.contents).toBe('write')
    expect(prJob.permissions?.['pull-requests']).toBe('write')
    expect(prJob.permissions?.issues).toBe('write')
  })

  it('never leaves an open alert silent while the auto-PR is pending', () => {
    // 'auto' suppresses the daily issue refresh, so the open alert MUST be
    // told where its fix went — exactly once per PR, not once per day.
    const link = stepNamed(prJob, 'Link the open alert issue')
    expect(link.if).toBe("steps.registry-pr.outputs.pr_created == 'true'")
    expect(link.run).toContain('gh issue comment')
  })

  it('falls back to the loud human alert when auto-remediation fails', () => {
    // Fail-closed (L107): a remediation path that breaks must not be visible
    // only as a red run nobody reads.
    const fallback = stepNamed(prJob, 'Fall back to the human alert')
    expect(fallback.if).toBe('failure()')
    expect(fallback.run).toContain('closing-registry-stale')
  })

  it('pushes the bot branch with an explicit refspec, not --force-with-lease', () => {
    // actions/checkout fetches single-branch, so `origin/<bot branch>` has no
    // remote-tracking ref and a lease is evaluated against a missing ref —
    // every run after the first is rejected with "stale info", reddening the
    // pipeline while 'auto' also suppresses the issue refresh.
    const push = shellOf(stepNamed(prJob, 'Open or update the registry PR'))
    expect(push).toContain('git push --force origin "HEAD:refs/heads/')
    expect(push).not.toContain('--force-with-lease')
  })

  it('does not bypass git hooks when the bot commits (R1)', () => {
    const push = shellOf(stepNamed(prJob, 'Open or update the registry PR'))
    expect(push).not.toContain('--no-verify')
    // Formatting up front is what makes the hook a no-op without bypassing it.
    expect(push).toContain('npx prettier --write')
  })
})
