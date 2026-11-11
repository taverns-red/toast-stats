/**
 * Workflow contract: a slow Ubuntu mirror must not eat a PR Preview job's
 * whole timeout (#2600).
 *
 * On 2026-11-09, five smoke jobs were cancelled at their 20-minute job
 * timeout inside "Install Playwright browsers": `install --with-deps` was
 * fetching 139 MB of apt packages at 100-300 kB/s (run 42686172298, job
 * 129394370994), and the browser download never started. The apt packages
 * are not in the browser cache, so a cache hit does not help.
 *
 * So every job that installs Playwright splits the OS packages from the
 * browser download. Each part has its own short step timeout and exactly
 * one retry of that step, never a test retry, and the job timeout is not
 * raised.
 * Sourced from the YAML so the contract cannot drift.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { parse } from 'yaml'

const FILE = path.join(process.cwd(), '.github/workflows/pr-preview.yml')
const STEP_TIMEOUT_MAX = 5
/** Minutes the rest of the job (npm ci, the tests) keeps in the worst case. */
const JOB_HEADROOM = 5

interface Step {
  id?: string
  name?: string
  run?: string
  if?: string
  'timeout-minutes'?: number
  'continue-on-error'?: boolean
}
interface Job {
  'timeout-minutes'?: number
  steps?: Step[]
}

const workflow = parse(fs.readFileSync(FILE, 'utf8')) as {
  jobs: Record<string, Job>
}

const installJobs = Object.entries(workflow.jobs).filter(([, job]) =>
  (job.steps ?? []).some(s => /npx playwright install/.test(s.run ?? ''))
)

/** The first attempt (continue-on-error) and its single retry, by command. */
function attempts(steps: Step[], command: RegExp): Step[] {
  return steps.filter(s => command.test(s.run ?? ''))
}

describe('PR Preview Playwright install (#2600)', () => {
  it('finds the jobs that install Playwright', () => {
    expect(installJobs.length).toBeGreaterThanOrEqual(2)
  })

  for (const [name, job] of installJobs) {
    const steps = job.steps ?? []

    it(`${name}: no step installs browsers and OS packages together`, () => {
      const combined = steps.filter(s => /--with-deps/.test(s.run ?? ''))
      expect(combined.map(s => s.name)).toEqual([])
    })

    for (const [label, command] of [
      ['OS packages', /npx playwright install-deps chromium webkit/],
      ['browser download', /npx playwright install chromium webkit/],
    ] as const) {
      it(`${name}: ${label} have a short timeout and exactly one retry`, () => {
        const found = attempts(steps, command)
        expect(found).toHaveLength(2)
        const [first, retry] = found as [Step, Step]
        for (const step of found) {
          expect(step['timeout-minutes']).toBeGreaterThan(0)
          expect(step['timeout-minutes']).toBeLessThanOrEqual(STEP_TIMEOUT_MAX)
        }
        expect(first['continue-on-error']).toBe(true)
        expect(first.id).toBeTruthy()
        expect(retry['continue-on-error']).toBeUndefined()
        expect(retry.if).toContain(`steps.${first.id}.outcome == 'failure'`)
        // No always(): a cancelled job must not start the retry.
        expect(retry.if).not.toMatch(/always\(\)/)
      })
    }

    it(`${name}: worst-case install time leaves the job ${JOB_HEADROOM} minutes`, () => {
      const total = steps
        .filter(s => /npx playwright install/.test(s.run ?? ''))
        .reduce((sum, s) => sum + (s['timeout-minutes'] ?? Infinity), 0)
      expect(job['timeout-minutes']).toBeGreaterThan(0)
      expect(total).toBeLessThanOrEqual(
        (job['timeout-minutes'] as number) - JOB_HEADROOM
      )
    })

    it(`${name}: the OS-package retry repairs an interrupted dpkg first`, () => {
      const [, retry] = attempts(steps, /npx playwright install-deps/)
      expect(retry?.run).toMatch(/sudo dpkg --configure -a/)
    })
  }
})
