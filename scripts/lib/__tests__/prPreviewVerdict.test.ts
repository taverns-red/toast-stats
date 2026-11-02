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

function runVerdict(env: Record<string, string>): number {
  const r = spawnSync('bash', ['-c', decide?.run ?? 'exit 99'], {
    env: { PATH: process.env.PATH ?? '', ...env },
    encoding: 'utf-8',
  })
  return r.status ?? -1
}

describe('pr-preview.yml: one verdict over every shard (#2453)', () => {
  it('is named for branch protection and needs deploy, smoke and lighthouse', () => {
    expect(verdict?.name).toBe('PR Preview verdict')
    expect(verdict?.needs).toEqual(['preview', 'smoke', 'lighthouse'])
  })

  it('runs whatever the shards concluded, but not for a cancelled or skipped run', () => {
    expect(verdict?.if).toBe(
      "${{ !cancelled() && needs.preview.result != 'skipped' }}"
    )
  })

  it('reads every result through env', () => {
    expect(decide?.env).toEqual({
      DEPLOY: '${{ needs.preview.result }}',
      SMOKE: '${{ needs.smoke.result }}',
      LIGHTHOUSE: '${{ needs.lighthouse.result }}',
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
      DEPLOY: 'success',
      SMOKE: 'success',
      LIGHTHOUSE: 'success',
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
      ['the deploy failed', { DEPLOY: 'failure' }],
      ['heavy is missing', { HEAVY: '' }],
    ])('fails when %s', (_label, over) => {
      expect(runVerdict({ ...ok, ...over })).not.toBe(0)
    })

    it('passes a draft whose shards were skipped by design (#2101)', () => {
      expect(
        runVerdict({
          DEPLOY: 'success',
          SMOKE: 'skipped',
          LIGHTHOUSE: 'skipped',
          HEAVY: 'false',
        })
      ).toBe(0)
    })

    it('fails a draft whose shards ran anyway', () => {
      expect(
        runVerdict({
          DEPLOY: 'success',
          SMOKE: 'success',
          LIGHTHOUSE: 'skipped',
          HEAVY: 'false',
        })
      ).not.toBe(0)
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

    it('is diagnostics only: it cannot change the verdict', () => {
      expect(timing?.['continue-on-error']).toBe(true)
      expect(comment?.['continue-on-error']).toBe(true)
    })
  })
})
