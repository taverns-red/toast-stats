/**
 * Workflow contract: ci.yml supersedes stale PR runs without ever cancelling
 * a run that matters (#2607 item 2).
 *
 * Why each clause exists:
 * - A per-PR group with cancel-in-progress stops a push from paying for the
 *   run it just made obsolete.
 * - Cancel only on `pull_request`. A push to main (or a tag, or a
 *   workflow_call from a release path) must run to completion; and because a
 *   same-group run that is merely *queued* is also dropped when a newer one
 *   arrives, those events get a group unique to the run.
 * - A no-op PR edit (title/body, not base) runs ci.yml with every job skipped
 *   (#2204). If it shared the PR's group it would cancel the real in-flight
 *   run and leave a cancelled required check on the head with only a skipped
 *   run beside it, so CI Gate would fail. It gets its own group, exactly as
 *   docs.yml does (#2204, #2316).
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { parse } from 'yaml'

const FILE = path.resolve(process.cwd(), '.github/workflows/ci.yml')

interface Workflow {
  concurrency?: { group?: string; 'cancel-in-progress'?: unknown } | string
}

const wf = (): Workflow => parse(fs.readFileSync(FILE, 'utf-8')) as Workflow
const conc = () => {
  const c = wf().concurrency
  return typeof c === 'object' && c !== null ? c : undefined
}

describe('ci.yml concurrency (#2607)', () => {
  it('declares a concurrency block', () => {
    expect(conc()).toBeDefined()
  })

  it('groups per pull request', () => {
    expect(conc()?.group).toContain('github.event.pull_request.number')
  })

  it('cancels in progress only for pull_request events', () => {
    const cancel = String(conc()?.['cancel-in-progress'])
    expect(cancel).toContain("github.event_name == 'pull_request'")
    expect(cancel).not.toBe('true')
  })

  it('gives push, tag and workflow_call runs a group unique to the run', () => {
    // A shared group would drop a queued main run when a newer one arrives.
    expect(conc()?.group).toContain('github.run_id')
    expect(conc()?.group).not.toMatch(/github\.ref\b/)
  })

  it('isolates a no-op edit so it cannot cancel the real run (#2204)', () => {
    const group = String(conc()?.group)
    expect(group).toContain("github.event.action == 'edited'")
    expect(group).toContain('github.event.changes.base')
    expect(group).toContain('github.run_id')
  })
})
