/**
 * Workflow contract: PR Preview never re-deploys a channel for a PR that is
 * already closed (#2372, found while verifying #2278).
 *
 * pr-preview-cleanup.yml deletes `pr-<N>` on close (#741). A `labeled` event
 * on a closed PR (e.g. `preview-smoke` added after merge) still fires
 * pr-preview.yml, which would re-create the channel after cleanup. That channel
 * then sits on the staging site's ~50-channel quota until its 7-day TTL.
 *
 * The contract:
 *   - The deploy job only runs while the event's PR is open.
 *   - An event for a non-open PR gets a run-unique concurrency group, so it
 *     cannot cancel a pending or in-flight cleanup run in the shared per-PR
 *     group (prPreviewCleanupRace.test.ts pins that group).
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { parse } from 'yaml'

const WORKFLOWS = path.join(process.cwd(), '.github/workflows')

interface Workflow {
  concurrency?: { group?: string; 'cancel-in-progress'?: boolean }
  jobs?: Record<string, { if?: string }>
}

const wf = parse(
  fs.readFileSync(path.join(WORKFLOWS, 'pr-preview.yml'), 'utf-8')
) as Workflow

const squash = (s: string | undefined): string =>
  (s ?? '').replace(/\s+/g, ' ').trim()

describe('pr-preview.yml: no preview for a closed PR (#2372)', () => {
  it('runs the deploy job only while the PR is open', () => {
    expect(squash(wf.jobs?.['preview']?.if)).toContain(
      "github.event.pull_request.state == 'open'"
    )
  })

  it('gives a non-open PR event its own group so it never cancels cleanup', () => {
    const group = squash(wf.concurrency?.group)
    expect(group).toContain("github.event.pull_request.state != 'open'")
    expect(group).toContain('github.run_id')
  })
})
