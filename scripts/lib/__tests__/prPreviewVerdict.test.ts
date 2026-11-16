/**
 * Contract: the PR Preview verdict job (#2453).
 *
 * The preview smokes run as a matrix of parallel shards plus one Lighthouse
 * job per route. A matrix reports one check per shard, so a single job,
 * `PR Preview verdict`, needs every one of them and turns their results into
 * one pass/fail: the check to require if PR Preview is ever made gating.
 *
 * The verdict script is executed here with each combination of results, so
 * the test proves behaviour, not just wiring (Lesson 082). R17: every value
 * of `heavy` has an explicit case.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { spawnSync } from 'node:child_process'
import { parse } from 'yaml'

const ROOT = process.cwd()
const PR_PREVIEW = path.join(ROOT, '.github/workflows/pr-preview.yml')

interface Step {
  name?: string
  id?: string
  if?: string
  run?: string
  uses?: string
  env?: Record<string, string>
  with?: Record<string, unknown>
  'continue-on-error'?: boolean
}
interface Job {
  name?: string
  needs?: string | string[]
  if?: string
  permissions?: Record<string, string>
  steps?: Step[]
}

const wf = parse(fs.readFileSync(PR_PREVIEW, 'utf-8')) as {
  jobs: Record<string, Job>
}
const verdict = wf.jobs['verdict']
const steps = verdict?.steps ?? []
const decide = steps.find(s => s.name === 'Verdict')

function runVerdictFull(env: Record<string, string>): {
  status: number
  summary: string
} {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verdict-'))
  const summaryFile = path.join(dir, 'summary.md')
  const r = spawnSync('bash', ['-c', decide?.run ?? 'exit 99'], {
    env: {
      PATH: process.env.PATH ?? '',
      GITHUB_STEP_SUMMARY: summaryFile,
      ...env,
    },
    encoding: 'utf-8',
  })
  const summary = fs.existsSync(summaryFile)
    ? fs.readFileSync(summaryFile, 'utf-8')
    : ''
  fs.rmSync(dir, { recursive: true, force: true })
  return { status: r.status ?? -1, summary }
}
const runVerdict = (env: Record<string, string>): number =>
  runVerdictFull(env).status

describe('pr-preview.yml: one verdict over every shard (#2453)', () => {
  it('is named for branch protection and needs the classifier, deploy, smoke, lighthouse and the real-preview smoke', () => {
    expect(verdict?.name).toBe('PR Preview verdict')
    expect(verdict?.needs).toEqual([
      'changes', // #2865
      'preview',
      'smoke',
      'lighthouse',
      'preview-smoke', // #2544
    ])
  })

  it('runs whatever the shards concluded, on every open PR event (#2865)', () => {
    expect(verdict?.if).toContain('!cancelled()')
    expect(verdict?.if).not.toContain('skipped')
  })

  it('reads every result through env', () => {
    expect(decide?.env).toEqual({
      CHANGES: '${{ needs.changes.result }}',
      PREVIEW_NEEDED: '${{ needs.changes.outputs.preview }}',
      FORK: '${{ github.event.pull_request.head.repo.full_name != github.repository }}',
      DEPENDABOT: "${{ github.actor == 'dependabot[bot]' }}",
      DEPLOY: '${{ needs.preview.result }}',
      SMOKE: '${{ needs.smoke.result }}',
      LIGHTHOUSE: '${{ needs.lighthouse.result }}',
      PREVIEW_SMOKE: '${{ needs.preview-smoke.result }}',
      HEAVY: '${{ needs.preview.outputs.heavy }}',
    })
    expect(decide?.if).toBeUndefined()
    expect(decide?.['continue-on-error']).toBeUndefined()
  })

  it('is the last step, so nothing after it can mask its result', () => {
    expect(steps.at(-1)).toBe(decide)
  })

  describe('the verdict script', () => {
    const ok = {
      CHANGES: 'success',
      PREVIEW_NEEDED: 'true',
      FORK: 'false',
      DEPENDABOT: 'false',
      DEPLOY: 'success',
      SMOKE: 'success',
      LIGHTHOUSE: 'success',
      PREVIEW_SMOKE: 'success',
      HEAVY: 'true',
    }

    it('passes when the deploy and every shard passed', () => {
      expect(runVerdict(ok)).toBe(0)
    })

    it.each([
      ['a smoke shard failed', { SMOKE: 'failure' }],
      ['a Lighthouse route failed', { LIGHTHOUSE: 'failure' }],
      ['the smoke shards were cancelled', { SMOKE: 'cancelled' }],
      ['the smoke shards were skipped on a heavy run', { SMOKE: 'skipped' }],
      ['Lighthouse was skipped on a heavy run', { LIGHTHOUSE: 'skipped' }],
      ['the real-preview smoke failed (#2544)', { PREVIEW_SMOKE: 'failure' }],
      [
        'the real-preview smoke was skipped on a heavy run',
        { PREVIEW_SMOKE: 'skipped' },
      ],
      ['the deploy failed', { DEPLOY: 'failure' }],
      ['heavy is missing', { HEAVY: '' }],
    ])('fails when %s', (_label, over) => {
      expect(runVerdict({ ...ok, ...over })).not.toBe(0)
    })

    it('passes a draft whose shards were skipped by design (#2101)', () => {
      expect(
        runVerdict({
          ...ok,
          DEPLOY: 'success',
          SMOKE: 'skipped',
          LIGHTHOUSE: 'skipped',
          PREVIEW_SMOKE: 'skipped',
          HEAVY: 'false',
        })
      ).toBe(0)
    })

    it('fails a draft whose shards ran anyway', () => {
      expect(
        runVerdict({
          ...ok,
          DEPLOY: 'success',
          SMOKE: 'success',
          LIGHTHOUSE: 'skipped',
          PREVIEW_SMOKE: 'skipped',
          HEAVY: 'false',
        })
      ).not.toBe(0)
    })

    it('fails a draft whose real-preview smoke ran anyway (#2544)', () => {
      expect(
        runVerdict({
          ...ok,
          DEPLOY: 'success',
          SMOKE: 'skipped',
          LIGHTHOUSE: 'skipped',
          PREVIEW_SMOKE: 'success',
          HEAVY: 'false',
        })
      ).not.toBe(0)
    })
  })

  describe('no preview path changed (#2865)', () => {
    const notNeeded = {
      CHANGES: 'success',
      PREVIEW_NEEDED: 'false',
      FORK: 'false',
      DEPENDABOT: 'false',
      DEPLOY: 'skipped',
      SMOKE: 'skipped',
      LIGHTHOUSE: 'skipped',
      PREVIEW_SMOKE: 'skipped',
      HEAVY: '',
    }

    it('passes, and says why in the step summary', () => {
      const r = runVerdictFull(notNeeded)
      expect(r.status).toBe(0)
      expect(r.summary).toContain(
        'Preview not needed: no preview paths changed'
      )
    })

    it.each([
      ['the deploy ran', { DEPLOY: 'success' }],
      ['a smoke shard ran', { SMOKE: 'success' }],
      ['Lighthouse ran', { LIGHTHOUSE: 'failure' }],
      ['the real-preview smoke ran', { PREVIEW_SMOKE: 'success' }],
    ])('fails if %s, since the classifier and the jobs disagree', (_l, o) => {
      expect(runVerdict({ ...notNeeded, ...o })).not.toBe(0)
    })

    it('fails when the classifier itself failed', () => {
      expect(runVerdict({ ...notNeeded, CHANGES: 'failure' })).not.toBe(0)
    })

    it.each(['', 'maybe'])('fails on a malformed output %j', v => {
      expect(runVerdict({ ...notNeeded, PREVIEW_NEEDED: v })).not.toBe(0)
    })
  })

  describe('a preview path changed but no preview can run (#2865)', () => {
    const noDeploy = {
      CHANGES: 'success',
      PREVIEW_NEEDED: 'true',
      FORK: 'false',
      DEPENDABOT: 'false',
      DEPLOY: 'skipped',
      SMOKE: 'skipped',
      LIGHTHOUSE: 'skipped',
      PREVIEW_SMOKE: 'skipped',
      HEAVY: '',
    }

    it('passes a fork PR with a note, so it is not blocked forever', () => {
      const r = runVerdictFull({ ...noDeploy, FORK: 'true' })
      expect(r.status).toBe(0)
      expect(r.summary).toContain(
        'Preview not run for fork PRs (no secrets); CI Gate still applies'
      )
    })

    it('passes a Dependabot PR with a note', () => {
      const r = runVerdictFull({ ...noDeploy, DEPENDABOT: 'true' })
      expect(r.status).toBe(0)
      expect(r.summary).toContain('Preview not run for Dependabot')
    })

    it('fails a fork PR whose shards ran anyway', () => {
      expect(
        runVerdict({ ...noDeploy, FORK: 'true', SMOKE: 'success' })
      ).not.toBe(0)
    })

    it('fails an ordinary PR whose deploy was skipped: a skipped needed job is not success', () => {
      expect(runVerdict(noDeploy)).not.toBe(0)
    })

    it('fails when the classifier failed, fork or not', () => {
      expect(
        runVerdict({ ...noDeploy, FORK: 'true', CHANGES: 'failure' })
      ).not.toBe(0)
    })

    it('fails when the classifier was skipped', () => {
      expect(runVerdict({ ...noDeploy, CHANGES: 'skipped' })).not.toBe(0)
    })
  })

  describe('timing in the sticky preview comment', () => {
    const comment = steps.find(s =>
      s.uses?.startsWith('marocchino/sticky-pull-request-comment')
    )
    const timing = steps.find(s => s.id === 'timing')

    it('times the run from the GitHub API, read-only', () => {
      expect(verdict?.permissions?.['actions']).toBe('read')
      expect(timing?.run).toContain('actions/runs/')
      expect(timing?.run).toMatch(/300/)
      expect(timing?.run).toMatch(/480/)
    })

    it('updates the same sticky comment, keeping the Live URL line', () => {
      expect(comment?.with?.['header']).toBe('pr-preview')
      expect(timing?.run).toContain('**Live URL:** ${URL}')
      expect(timing?.run).toContain('Channel expires: ${EXPIRES}')
    })

    it('only runs when a preview was attempted (#2865)', () => {
      expect(timing?.if).toBe("needs.preview.result != 'skipped'")
    })

    it('is diagnostics only: it cannot change the verdict', () => {
      expect(timing?.['continue-on-error']).toBe(true)
      expect(comment?.['continue-on-error']).toBe(true)
    })
  })
})
