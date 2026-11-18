/**
 * Workflow contract: the live how-to video URLs are checked after every
 * production deploy (#2899).
 *
 * Since #2570 the PR Preview smokes serve a stand-in for every video, so a
 * prod video that is deleted or moved fails no other check. The post-deploy
 * verify job runs `scripts/check-video-urls.ts`, which reads public URLs
 * only. The job must keep its empty `permissions: {}` (#2879) and must not
 * gain a token, a secret or cloud credentials to do it. Sourced from the YAML
 * so the wiring cannot drift.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { parse } from 'yaml'

const FILE = path.resolve(process.cwd(), '.github/workflows/deploy.yml')

interface Step {
  name?: string
  uses?: string
  run?: string
  env?: Record<string, string>
}
interface Job {
  permissions?: Record<string, string>
  needs?: string | string[]
  steps: Step[]
}
interface Workflow {
  permissions?: Record<string, string>
  jobs: Record<string, Job>
}

const raw = fs.readFileSync(FILE, 'utf-8')
const wf = parse(raw) as Workflow
const verify = wf.jobs['post-deploy-verify'] as Job
const checkStep = verify.steps.find(s =>
  (s.run ?? '').includes('check-video-urls')
)

describe('deploy.yml post-deploy-verify video URL check (#2899)', () => {
  it('runs scripts/check-video-urls.ts in the post-deploy verify job', () => {
    expect(checkStep).toBeDefined()
  })

  it('runs after the deploy job, so it checks what just shipped', () => {
    expect([verify.needs].flat()).toContain('deploy-frontend')
  })

  it('keeps the job and the workflow at no permissions', () => {
    expect(verify.permissions).toEqual({})
    expect(wf.permissions).toEqual({})
  })

  it('uses no secrets, no token and no cloud auth for the check', () => {
    expect(checkStep).toBeDefined()
    const body = JSON.stringify(checkStep)
    expect(body).not.toMatch(/secrets\./)
    expect(body).not.toMatch(/github\.token|GITHUB_TOKEN|GH_TOKEN/)
    const jobBody = JSON.stringify(verify)
    expect(jobBody).not.toMatch(/google-github-actions|workload/)
    expect(jobBody).not.toMatch(/actions\/checkout/)
  })
})
