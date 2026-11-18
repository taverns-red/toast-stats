/**
 * #2966: shape of the read-only identity smoke workflow. It signs in as a
 * privileged identity, so it must stay dispatch-only, main-only, read-only
 * and unable to do more than mint a token and read.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { parse } from 'yaml'
import {
  EXPECTED,
  HOSTING_DEPLOY,
  HOSTING_DEPLOY_ENVIRONMENT,
  MEDIA,
  RESTORE,
  RESTORE_ENVIRONMENT,
  collectEnvironments,
  loadWorkflows,
} from '../gcpIdentityMap'
import { IDENTITY_EXPECTATIONS } from '../identitySmoke'

const FILE = 'gcp-identity-smoke.yml'
const text = fs.readFileSync(
  path.join(process.cwd(), '.github/workflows', FILE),
  'utf-8'
)
const wf = parse(text) as {
  on: Record<string, unknown>
  permissions: Record<string, string>
  jobs: Record<
    string,
    {
      if?: string
      environment?: string
      permissions?: Record<string, string>
      steps: Array<{
        name?: string
        uses?: string
        run?: string
        env?: Record<string, unknown>
        with?: Record<string, unknown>
      }>
    }
  >
}

describe('gcp-identity-smoke workflow (#2966)', () => {
  it('triggers on workflow_dispatch only', () => {
    expect(Object.keys(wf.on)).toEqual(['workflow_dispatch'])
  })

  it('grants contents: read and id-token: write, nothing else', () => {
    expect(wf.permissions).toEqual({ contents: 'read', 'id-token': 'write' })
    for (const job of Object.values(wf.jobs)) {
      expect(job.permissions ?? wf.permissions).toEqual({
        contents: 'read',
        'id-token': 'write',
      })
    }
  })

  it('runs the restore job from main, in the data-restore environment', () => {
    const job = wf.jobs['restore']!
    expect(job.environment).toBe(RESTORE_ENVIRONMENT)
    expect(job.if).toMatch(/github\.ref == 'refs\/heads\/main'/)
  })

  it('registers the restore job as the restore identity', () => {
    expect(EXPECTED[`${FILE}::restore`]).toBe(RESTORE)
    expect(collectEnvironments(loadWorkflows())[`${FILE}::restore`]).toBe(
      RESTORE_ENVIRONMENT
    )
  })

  it('runs the media job from main, with no environment', () => {
    const job = wf.jobs['media']!
    expect(job.environment).toBeUndefined()
    expect(job.if).toMatch(/github\.ref == 'refs\/heads\/main'/)
    expect(job.if).toMatch(/inputs\.identity == 'media'/)
  })

  it('registers the media job as the media identity', () => {
    expect(EXPECTED[`${FILE}::media`]).toBe(MEDIA)
  })

  it('checks the media variable is non-empty before the media job authenticates', () => {
    const steps = wf.jobs['media']!.steps
    const authAt = steps.findIndex(s =>
      /google-github-actions\/auth/.test(s.uses ?? '')
    )
    const guardAt = steps.findIndex(
      s =>
        /vars\.GCP_MEDIA_SA/.test(String(Object.values(s.env ?? {}))) &&
        /-z\b/.test(s.run ?? '') &&
        /exit 1/.test(s.run ?? '')
    )
    expect(authAt).toBeGreaterThan(0)
    expect(guardAt).toBeGreaterThanOrEqual(0)
    expect(guardAt).toBeLessThan(authAt)
    const auth = steps[authAt]!
    expect(auth.with?.['token_format']).toBe('access_token')
    expect(auth.with?.['create_credentials_file']).toBe(false)
  })

  it('smokes the media identity with the media script argument', () => {
    const run = wf.jobs['media']!.steps.map(s => s.run ?? '').join('\n')
    expect(run).toMatch(/identity-smoke\.ts media\b/)
  })

  it('runs the hosting-deploy job from main, in the production environment (#2984)', () => {
    const job = wf.jobs['hosting-deploy']!
    expect(job.environment).toBe(HOSTING_DEPLOY_ENVIRONMENT)
    expect(job.if).toMatch(/github\.ref == 'refs\/heads\/main'/)
    expect(job.if).toMatch(/inputs\.identity == 'hosting-deploy'/)
    expect(EXPECTED[`${FILE}::hosting-deploy`]).toBe(HOSTING_DEPLOY)
  })

  it('checks the hosting-deploy variable before auth, and smokes with its argument and the project id (#2984)', () => {
    const steps = wf.jobs['hosting-deploy']!.steps
    const authAt = steps.findIndex(s =>
      /google-github-actions\/auth/.test(s.uses ?? '')
    )
    const guardAt = steps.findIndex(
      s =>
        /vars\.GCP_HOSTING_DEPLOY_SA/.test(
          String(Object.values(s.env ?? {}))
        ) &&
        /-z\b/.test(s.run ?? '') &&
        /exit 1/.test(s.run ?? '')
    )
    expect(guardAt).toBeGreaterThanOrEqual(0)
    expect(guardAt).toBeLessThan(authAt)
    const auth = steps[authAt]!
    expect(auth.with?.['token_format']).toBe('access_token')
    expect(auth.with?.['create_credentials_file']).toBe(false)
    const smoke = steps.find(s =>
      /identity-smoke\.ts hosting-deploy\b/.test(s.run ?? '')
    )
    expect(smoke?.env?.['PROJECT_ID']).toBe('${{ secrets.GCP_PROJECT_ID }}')
  })

  it('checks the restore variable is non-empty before it authenticates', () => {
    const steps = wf.jobs['restore']!.steps
    const authAt = steps.findIndex(s =>
      /google-github-actions\/auth/.test(s.uses ?? '')
    )
    const guardAt = steps.findIndex(
      s =>
        /vars\.GCP_RESTORE_SA/.test(String(Object.values(s.env ?? {}))) &&
        /-z\b/.test(s.run ?? '') &&
        /exit 1/.test(s.run ?? '')
    )
    expect(authAt).toBeGreaterThan(0)
    expect(guardAt).toBeGreaterThanOrEqual(0)
    expect(guardAt).toBeLessThan(authAt)
  })

  it('asks for an access token, with no credentials file', () => {
    const auth = wf.jobs['restore']!.steps.find(s =>
      /google-github-actions\/auth/.test(s.uses ?? '')
    )
    expect(auth?.with?.['token_format']).toBe('access_token')
    expect(auth?.with?.['create_credentials_file']).toBe(false)
  })

  it('offers only identities that have an expectation', () => {
    const options = (
      wf.on['workflow_dispatch'] as {
        inputs: { identity: { options: string[] } }
      }
    ).inputs.identity.options
    expect(options.every(o => o in IDENTITY_EXPECTATIONS)).toBe(true)
  })

  it('installs with --ignore-scripts so no package script runs beside the OIDC token', () => {
    for (const job of Object.values(wf.jobs)) {
      const installs = job.steps
        .map(s => s.run ?? '')
        .filter(r => /\bnpm (ci|install)\b/.test(r))
      expect(installs.length).toBeGreaterThan(0)
      for (const r of installs) expect(r).toMatch(/--ignore-scripts/)
    }
  })

  it('does not write: no gcloud, gh or curl mutation in a run step', () => {
    const runs = Object.values(wf.jobs)
      .flatMap(j => j.steps.map(s => s.run ?? ''))
      .join('\n')
    expect(runs).not.toMatch(
      /\bgcloud\b|\bgh\b|\bgsutil\b|-X\s*(POST|PUT|DELETE|PATCH)/
    )
  })
})
