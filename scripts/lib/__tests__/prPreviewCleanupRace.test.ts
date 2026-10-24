/**
 * Workflow contract: PR Preview Cleanup must not delete a PR's preview channel
 * while that PR's PR Preview run is still using it (#2278, found in #2248).
 *
 * Incident: PR #2245 merged at 03:09:07Z; cleanup run 40057129641 deleted
 * `pr-2245` at 03:09:50Z while the attempt-2 smoke (run 40050767724) was
 * mid-suite, so every later test failed against a 404 channel.
 *
 * The fix puts the cleanup run in the SAME concurrency group as pr-preview.yml
 * with `cancel-in-progress: true`. GitHub concurrency groups are repo-scoped
 * across workflows, so the closing cleanup run cancels the in-flight (or
 * pending) preview run for that PR, and the cleanup run itself stays pending
 * until the cancelled run has completed. Observed on run 40123409607: it was
 * cancelled at 19:05:52Z and its successor's job was created at 19:05:53Z,
 * although the successor run was queued at 19:05:07Z. So the delete always
 * comes after the preview run has finished. No `actions: write` is needed.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { parse } from 'yaml'

const ROOT = process.cwd()
const WORKFLOWS = path.join(ROOT, '.github/workflows')

interface Step {
  name?: string
  run?: string
}
interface Workflow {
  on?: { pull_request?: { types?: string[] } }
  concurrency?: { group?: string; 'cancel-in-progress'?: boolean }
  permissions?: Record<string, string>
  jobs?: Record<string, { steps?: Step[] }>
}

function load(file: string): Workflow {
  return parse(fs.readFileSync(path.join(WORKFLOWS, file), 'utf-8')) as Workflow
}

const preview = load('pr-preview.yml')
const cleanup = load('pr-preview-cleanup.yml')
const PER_PR_GROUP = 'pr-preview-${{ github.event.pull_request.number }}'

/** pr-preview's group with whitespace from the folded YAML scalar removed. */
function previewGroupBase(): string {
  const group = (preview.concurrency?.group ?? '').replace(/\s+/g, ' ').trim()
  // The suffix expression only differs for `labeled` events (#2101); for
  // every other event it evaluates to '' and the group is the per-PR base.
  const suffixAt = group.indexOf('${{', PER_PR_GROUP.length)
  return suffixAt === -1 ? group : group.slice(0, suffixAt)
}

describe('PR Preview Cleanup waits out the PR Preview run (#2278)', () => {
  it('pr-preview.yml still uses the per-PR group base', () => {
    expect(previewGroupBase()).toBe(PER_PR_GROUP)
  })

  it('cleanup joins the same per-PR concurrency group', () => {
    expect(cleanup.concurrency?.group?.trim()).toBe(PER_PR_GROUP)
  })

  it('cleanup cancels the in-flight preview run rather than queueing', () => {
    expect(cleanup.concurrency?.['cancel-in-progress']).toBe(true)
  })

  it('needs no extra token permissions (no actions: write)', () => {
    expect(cleanup.permissions).toEqual({
      contents: 'read',
      'id-token': 'write',
    })
  })

  it('still reaps the channel on every close (quota, #741)', () => {
    expect(cleanup.on?.pull_request?.types).toEqual(['closed'])
    const steps = cleanup.jobs?.cleanup?.steps ?? []
    const del = steps.find(s => s.name === 'Delete preview channel')
    expect(del?.run).toContain('firebase hosting:channel:delete')
  })
})
