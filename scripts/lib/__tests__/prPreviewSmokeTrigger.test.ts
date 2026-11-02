/**
 * Workflow contract: the heavy preview smoke and Lighthouse run once a PR is
 * ready, not on every draft push (#2101).
 *
 * Firebase Hosting egress from the per-PR preview channels was the largest
 * live cost driver in October 2026 (CAD ~4.5/day): ~3 smoke runs per PR at
 * ~150–200 MB of app bytes each, most of them on pushes the author was still
 * iterating on. The contract:
 *
 *   - A draft PR push still builds and deploys the preview (so the URL is
 *     there to look at) but skips every Playwright smoke and the Lighthouse
 *     mobile gate, and desktop Lighthouse CI skips its job.
 *   - A non-draft PR (opened ready, `ready_for_review`, or any later push)
 *     runs everything, exactly as before.
 *   - The `preview-smoke` label forces the full suite on a draft. Applying it
 *     is the manual trigger; any OTHER label is a no-op and must not cancel an
 *     in-flight preview run through the concurrency group.
 *
 * Merge gating: neither workflow is in CI Gate's expected set
 * (scripts/lib/ciGate.ts), so a skipped smoke cannot open the gate. The last
 * block below pins that: if either is ever made required, this test fails and
 * the author has to make CI Gate re-run on `ready_for_review` too.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { parse } from 'yaml'
import { CI_CHECKS } from '../ciGate'

const ROOT = process.cwd()
const WORKFLOWS = path.join(ROOT, '.github/workflows')

interface Step {
  name?: string
  id?: string
  if?: string
  uses?: string
  run?: string
}
interface Job {
  name?: string
  needs?: string | string[]
  if?: string
  env?: Record<string, string>
  outputs?: Record<string, string>
  steps?: Step[]
}
interface Workflow {
  on?: { pull_request?: { types?: string[] } }
  concurrency?: { group?: string; 'cancel-in-progress'?: boolean }
  jobs?: Record<string, Job>
}

function load(file: string): Workflow {
  return parse(fs.readFileSync(path.join(WORKFLOWS, file), 'utf-8')) as Workflow
}

const LABEL = 'preview-smoke'
const HEAVY_JOB_IF = "needs.preview.outputs.heavy == 'true'"
const HEAVY_EXPR =
  "${{ github.event.pull_request.draft == false || contains(github.event.pull_request.labels.*.name, 'preview-smoke') }}"
/** Skip a `labeled` event unless it is our label. */
const LABEL_GUARD =
  "(github.event.action != 'labeled' || github.event.label.name == 'preview-smoke')"

const READY_TYPES = [
  'opened',
  'synchronize',
  'reopened',
  'ready_for_review',
  'labeled',
]

describe('pr-preview.yml: heavy smoke runs once the PR is ready (#2101)', () => {
  const wf = load('pr-preview.yml')
  const job = wf.jobs?.['preview']
  const steps = job?.steps ?? []

  it('triggers on ready_for_review and labeled as well as pushes', () => {
    expect(wf.on?.pull_request?.types).toEqual(READY_TYPES)
  })

  it('ignores labeled events for any other label', () => {
    expect(job?.if).toContain(LABEL_GUARD)
  })

  it('keeps an unrelated label from cancelling an in-flight run', () => {
    const group = wf.concurrency?.group ?? ''
    expect(wf.concurrency?.['cancel-in-progress']).toBe(true)
    // An unrelated labeled event gets its own (run-unique) group.
    expect(group).toContain("github.event.label.name != 'preview-smoke'")
    expect(group).toContain('github.run_id')
  })

  it('decides HEAVY_SMOKE from draft state and the preview-smoke label', () => {
    expect(job?.env?.['HEAVY_SMOKE']).toBe(HEAVY_EXPR)
  })

  it('still deploys the preview and posts the URL on every run', () => {
    for (const id of ['deploy']) {
      const step = steps.find(s => s.id === id)
      expect(step, `step ${id}`).toBeDefined()
      expect(step?.if).toBeUndefined()
    }
    const sticky = steps.find(s =>
      s.uses?.startsWith('marocchino/sticky-pull-request-comment')
    )
    expect(sticky?.if).toBeUndefined()
  })

  it('runs nothing heavy in the deploy job itself (#2453)', () => {
    // The smokes and Lighthouse run as their own jobs, gated on the deploy
    // job's `heavy` output. Only the skipped-report follows the comment.
    const stickyAt = steps.findIndex(s =>
      s.uses?.startsWith('marocchino/sticky-pull-request-comment')
    )
    expect(stickyAt).toBeGreaterThan(0)
    const after = steps.slice(stickyAt + 1).map(s => s.name)
    expect(after).toEqual(['Report heavy smoke skipped (draft PR)'])
    for (const s of steps) {
      expect(s.run ?? '').not.toMatch(/playwright/)
      expect(s.uses ?? '').not.toMatch(/lighthouse/)
    }
  })

  it('publishes the HEAVY_SMOKE decision for the shard jobs (#2453)', () => {
    expect(job?.outputs?.['heavy']).toBe('${{ steps.deploy.outputs.heavy }}')
    expect(job?.outputs?.['url']).toBe('${{ steps.deploy.outputs.url }}')
    const deploy = steps.find(s => s.id === 'deploy')
    expect(deploy?.run).toMatch(/echo "heavy=\$HEAVY_SMOKE"/)
  })

  it('gates every smoke and Lighthouse shard on that decision (#2453)', () => {
    for (const id of ['smoke', 'lighthouse']) {
      const shard = wf.jobs?.[id]
      expect(shard, `job ${id}`).toBeDefined()
      expect(shard?.needs).toBe('preview')
      expect(shard?.if).toBe(HEAVY_JOB_IF)
    }
  })

  it('says so in the job summary when the heavy suite is skipped', () => {
    const report = steps.find(s =>
      s.name?.startsWith('Report heavy smoke skipped')
    )
    expect(report?.if).toBe("env.HEAVY_SMOKE != 'true'")
    expect(report?.run).toContain(LABEL)
    expect(report?.run).toContain('GITHUB_STEP_SUMMARY')
  })
})

describe('lighthouse-ci.yml: runs once the PR is ready (#2101)', () => {
  const wf = load('lighthouse-ci.yml')
  const job = wf.jobs?.['lighthouse']

  it('triggers on ready_for_review and labeled as well as pushes', () => {
    expect(wf.on?.pull_request?.types).toEqual(READY_TYPES)
  })

  it('skips drafts unless labeled preview-smoke, and other labels', () => {
    expect(job?.if).toContain(LABEL_GUARD)
    expect(job?.if).toContain('github.event.pull_request.draft == false')
    expect(job?.if).toContain(
      "contains(github.event.pull_request.labels.*.name, 'preview-smoke')"
    )
  })
})

describe('merge gating stays honest (#2101)', () => {
  it('neither draft-skippable check is required by CI Gate', () => {
    // CI Gate runs on opened/synchronize/reopened only. If a check that a
    // draft legitimately skips became required, a draft-era `skipped` would
    // fail the gate and nothing would re-run it on ready_for_review. Making
    // one required means adding ready_for_review to ci-gate.yml first.
    const preview = load('pr-preview.yml').jobs?.['preview']?.name
    const lighthouse = 'lighthouse'
    expect(preview).toBe('Deploy preview channel')
    expect(CI_CHECKS as readonly string[]).not.toContain(preview)
    expect(CI_CHECKS as readonly string[]).not.toContain(lighthouse)
    // The #2453 verdict job is the one check to require if that ever
    // changes; today it is not required either.
    const verdict = load('pr-preview.yml').jobs?.['verdict']?.name
    expect(verdict).toBe('PR Preview verdict')
    expect(CI_CHECKS as readonly string[]).not.toContain(verdict)
  })
})
