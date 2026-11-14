/**
 * Workflow contract: the PR Preview jobs that run Playwright do it in the
 * official Playwright image, with no OS-package install on the hot path
 * (#2615, follow-up to #2600).
 *
 * On 2026-11-09, five smoke jobs were cancelled at their 20-minute job
 * timeout inside "Install Playwright browsers": `install --with-deps` was
 * fetching 139 MB of apt packages at 100-300 kB/s (run 42686172298, job
 * 129394370994). #2612 capped that with step timeouts and one retry; the
 * lasting fix is to not run apt at all. The image for the pinned Playwright
 * version already has the OS packages and the browsers, on the same Ubuntu
 * release as the runner (26.04, `resolute`).
 *
 * The image tag must equal the pinned @playwright/test version, or the
 * browsers in the image would not match the library. Sourced from the YAML
 * and the lockfile so the contract cannot drift.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { parse } from 'yaml'

const ROOT = process.cwd()
const FILE = path.join(ROOT, '.github/workflows/pr-preview.yml')
const IMAGE_REPO = 'mcr.microsoft.com/playwright'
const IMAGE_DISTRO = 'resolute'

interface Step {
  name?: string
  run?: string
  uses?: string
}
interface Job {
  container?: { image?: string; options?: string } | string
  defaults?: { run?: { shell?: string } }
  steps?: Step[]
}

const workflow = parse(fs.readFileSync(FILE, 'utf8')) as {
  jobs: Record<string, Job>
}

const lock = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8')
) as { packages: Record<string, { version?: string }> }
const pinned = lock.packages['node_modules/@playwright/test']?.version

/** Jobs that run `npx playwright test`. */
const playwrightJobs = Object.entries(workflow.jobs).filter(([, job]) =>
  (job.steps ?? []).some(s => /npx playwright test/.test(s.run ?? ''))
)

describe('PR Preview runs Playwright in the official image (#2615)', () => {
  it('finds the lockfile version and the jobs that run Playwright', () => {
    expect(pinned).toMatch(/^\d+\.\d+\.\d+$/)
    expect(playwrightJobs.map(([name]) => name).sort()).toEqual([
      'preview-smoke',
      'smoke',
    ])
  })

  for (const [name, job] of playwrightJobs) {
    const steps = job.steps ?? []

    it(`${name}: runs in the image pinned to @playwright/test`, () => {
      const container =
        typeof job.container === 'string'
          ? { image: job.container }
          : job.container
      expect(container?.image).toBe(`${IMAGE_REPO}:v${pinned}-${IMAGE_DISTRO}`)
    })

    it(`${name}: shares memory and reaps processes like the Playwright docs`, () => {
      const options =
        typeof job.container === 'object' ? job.container.options : ''
      expect(options).toMatch(/--ipc=host/)
      expect(options).toMatch(/--init/)
    })

    it(`${name}: run steps use bash, not the container's default sh`, () => {
      // A container job's default shell is `sh` (dash): the shard script's
      // bash arrays fail there with `Syntax error: "(" unexpected`.
      expect(job.defaults?.run?.shell).toBe('bash')
    })

    it(`${name}: installs no OS packages or browsers`, () => {
      const offenders = steps.filter(s =>
        /playwright install|apt-get|apt install|dpkg/.test(s.run ?? '')
      )
      expect(offenders.map(s => s.name)).toEqual([])
      expect(steps.some(s => s.uses?.startsWith('actions/cache@'))).toBe(false)
    })
  }
})
