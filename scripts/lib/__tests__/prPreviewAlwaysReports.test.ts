/**
 * Workflow shape: PR Preview reports a `PR Preview verdict` on every open PR
 * so it can be a required check (#2865). Modelled on how #2859 folded CI Gate
 * into ci.yml (`changes` job + `needs:` + `always()`-style gate).
 *
 * The `paths:` filter that used to decide whether the workflow ran moves into
 * a `changes` job (scripts/lib/previewPaths.ts). A PR touching no preview path
 * skips the preview, the shards and Lighthouse, and the verdict still reports.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'yaml'

interface Job {
  name?: string
  needs?: string | string[]
  if?: string
  permissions?: Record<string, string>
  outputs?: Record<string, string>
}
interface Workflow {
  on: { pull_request: { types?: string[]; paths?: string[] } }
  permissions?: Record<string, string>
  concurrency?: { group?: string }
  jobs: Record<string, Job>
}

const raw = readFileSync(
  join(process.cwd(), '.github/workflows/pr-preview.yml'),
  'utf8'
)
const wf = parse(raw) as Workflow
const asList = (n: Job['needs']) => (Array.isArray(n) ? n : n ? [n] : [])

describe('pr-preview.yml runs on every PR (#2865)', () => {
  it('has no paths filter on pull_request', () => {
    expect(wf.on.pull_request.paths).toBeUndefined()
  })

  it('keeps the same event types (preview-smoke label logic untouched)', () => {
    expect(wf.on.pull_request.types).toEqual([
      'opened',
      'synchronize',
      'reopened',
      'ready_for_review',
      'labeled',
    ])
  })
})

describe('the changes job classifies the diff', () => {
  const changes = wf.jobs['changes']

  it('exists, with a single `preview` output', () => {
    expect(changes).toBeDefined()
    expect(Object.keys(changes?.outputs ?? {})).toEqual(['preview'])
  })

  it('holds only a job-level contents: read token', () => {
    expect(changes?.permissions).toEqual({ contents: 'read' })
  })

  it('is cheap: it needs nothing and runs only for events that can produce a verdict', () => {
    expect(asList(changes?.needs)).toEqual([])
    expect(changes?.if).toContain("github.event.pull_request.state == 'open'")
    expect(changes?.if).toContain("github.event.label.name == 'preview-smoke'")
  })

  it('runs scripts/preview-changes.ts, which classifies with needsPreview', () => {
    const run = JSON.stringify(
      (changes as unknown as { steps: unknown[] }).steps
    )
    expect(run).toContain('scripts/preview-changes.ts')
    const src = readFileSync(
      join(process.cwd(), 'scripts/preview-changes.ts'),
      'utf8'
    )
    expect(src).toContain('needsPreview')
    expect(src).toContain('preview=')
  })

  it('leaves the workflow-level permissions block as it was', () => {
    expect(wf.permissions).toEqual({
      contents: 'read',
      'id-token': 'write',
      'pull-requests': 'write',
    })
  })
})

describe('the deploy job runs only when a preview path changed', () => {
  const preview = wf.jobs['preview']

  it('needs changes and requires its `preview` output', () => {
    expect(asList(preview?.needs)).toContain('changes')
    expect(preview?.if).toContain("needs.changes.outputs.preview == 'true'")
  })

  it('keeps the fork, Dependabot and closed-PR guards', () => {
    expect(preview?.if).toContain(
      'github.event.pull_request.head.repo.full_name == github.repository'
    )
    expect(preview?.if).toContain("github.actor != 'dependabot[bot]'")
    expect(preview?.if).toContain("github.event.pull_request.state == 'open'")
  })
})

describe('the verdict reports on every open PR', () => {
  const verdict = wf.jobs['verdict']

  it('keeps the required-check name', () => {
    expect(verdict?.name).toBe('PR Preview verdict')
  })

  it('needs changes as well as every shard', () => {
    expect(asList(verdict?.needs)).toEqual([
      'changes',
      'preview',
      'smoke',
      'lighthouse',
      'preview-smoke',
    ])
  })

  it('no longer skips with the deploy job', () => {
    expect(verdict?.if).not.toContain("needs.preview.result != 'skipped'")
  })

  it('runs whatever its needs concluded, but not for a cancelled run', () => {
    expect(verdict?.if).toContain('!cancelled()')
  })

  it('does not run for a closed PR', () => {
    expect(verdict?.if).toContain("github.event.pull_request.state == 'open'")
  })

  // An unrelated label event used to leave the verdict skipped, which GitHub
  // counts as passing and which then cleared an earlier failure on the same
  // head. It now runs and mirrors the last real verdict (review of #2880, F1).
  // The mirror waits for the real preview run (about 40 minutes), so the job
  // timeout covers it. A deliberate wait, not a slow-test mask.
  it('allows 75 minutes, so a label added mid-run can wait for the real run', () => {
    expect(
      (verdict as unknown as { 'timeout-minutes': number })['timeout-minutes']
    ).toBe(75)
  })

  it('does not skip on an unrelated label event', () => {
    expect(verdict?.if).not.toContain('label')
  })

  it('keeps its job-level permissions unchanged', () => {
    expect(verdict?.permissions).toEqual({
      actions: 'read',
      'pull-requests': 'write',
    })
  })
})
