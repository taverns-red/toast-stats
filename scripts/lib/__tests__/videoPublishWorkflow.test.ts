/**
 * Workflow contract: publish a reviewed how-to render to the CDN (#2310).
 *
 * `videos-publish.yml` takes a Videos run's artifact, re-verifies the
 * encoding with ffprobe, and writes it to `videos/` only:
 * - manual dispatch only, dry run by default (every publish is approved by
 *   Ron per publish, and the orchestrator dispatches it);
 * - the source run must be a successful run of videos.yml;
 * - every destination is an object the planner (scripts/lib/videoPublish.ts)
 *   produced, re-checked in shell against the same shape;
 * - every write goes through scripts/gcs-upload.ts (create-only insert with
 *   ifGenerationMatch=0, #2972) with video/mp4 and the immutable cache header;
 *   existing objects are refused before anything is written;
 * - prod gets a copy of the verified staging object, read from staging;
 * - no rm, rsync, mv, metadata update, CDN invalidation or gzip.
 * Sourced from the YAML so the guard cannot drift.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { parse } from 'yaml'
import { VIDEO_CACHE_CONTROL, VIDEO_CONTENT_TYPE } from '../videoPublish.js'

const FILE = path.resolve(process.cwd(), '.github/workflows/videos-publish.yml')

interface Step {
  name?: string
  id?: string
  if?: string
  run?: string
  uses?: string
  env?: Record<string, string>
  with?: Record<string, unknown>
}
interface Job {
  steps: Step[]
  env?: Record<string, string>
  permissions?: Record<string, string>
}
interface Workflow {
  on: Record<string, { inputs?: Record<string, Record<string, unknown>> }>
  env?: Record<string, string>
  permissions?: Record<string, string>
  jobs: Record<string, Job>
}

const raw = fs.existsSync(FILE) ? fs.readFileSync(FILE, 'utf-8') : ''
const wf = (raw ? parse(raw) : { on: {}, jobs: {} }) as Workflow
const steps = Object.values(wf.jobs).flatMap(j => j.steps)
const stepIndex = (name: string) => steps.findIndex(s => s.name === name)
/** Every shell command, continuation lines joined. */
const commands = steps.flatMap(s =>
  (s.run ?? '')
    .replace(/\\\n\s*/g, ' ')
    .split('\n')
    .map(cmd => ({ step: s, cmd: cmd.trim() }))
)
const storageWrites = commands.filter(c =>
  /gcs-upload\.ts (put|copy)\b|\bgcloud storage (cp|rsync|mv|rm)\b|\bobjects update\b|\bgsutil\b/.test(
    c.cmd
  )
)

describe('videos-publish.yml (#2310)', () => {
  it('exists and is manual-dispatch only', () => {
    expect(raw).not.toBe('')
    expect(Object.keys(wf.on)).toEqual(['workflow_dispatch'])
  })

  it('takes the source run id, scenario, version and a dry run defaulting to true', () => {
    const inputs = wf.on['workflow_dispatch']?.inputs ?? {}
    expect(Object.keys(inputs).sort()).toEqual([
      'dry_run',
      'run_id',
      'scenario',
      'version',
    ])
    for (const k of ['run_id', 'scenario', 'version']) {
      expect(inputs[k]?.['required'], k).toBe(true)
    }
    expect(inputs['dry_run']?.['type']).toBe('boolean')
    expect(inputs['dry_run']?.['default']).toBe(true)
  })

  it('has least-privilege token permissions', () => {
    expect(wf.permissions).toEqual({
      contents: 'read',
      actions: 'read',
      'id-token': 'write',
    })
  })

  it('only accepts a successful run of videos.yml as the source', () => {
    const run = steps.find(s => s.name === 'Check the source run')?.run ?? ''
    expect(run).toContain('.github/workflows/videos.yml')
    expect(run).toContain('success')
    expect(run).toMatch(/\^\[0-9\]\+\$/)
  })

  it('refuses a source run from a fork (code-scanning #148, #2488)', () => {
    const run = steps.find(s => s.name === 'Check the source run')?.run ?? ''
    // The fork's PR controls its artifact: only this repo's runs publish.
    expect(run).toContain('head_repository.full_name')
    expect(run).toMatch(/head_repo\s*==\s*\$repo/)
  })

  it('downloads the artifact outside the checkout (#2488)', () => {
    // The runner context is not allowed in job-level env (GitHub then
    // rejects the whole file), so a step sets DIR from $RUNNER_TEMP.
    const jobEnv = JSON.stringify(Object.values(wf.jobs)[0]?.env ?? {})
    expect(jobEnv).not.toMatch(/runner\./)
    expect(jobEnv).not.toContain('github.workspace')
    const set = stepIndex('Set the download dir outside the checkout')
    expect(set).toBeGreaterThanOrEqual(0)
    expect(steps[set]?.run).toMatch(
      /echo "DIR=\$RUNNER_TEMP\/video-publish" >> "\$GITHUB_ENV"/
    )
    expect(set).toBeLessThan(stepIndex('Download the render artifact'))
  })

  it('downloads the named artifact of that run', () => {
    const run = steps.find(s => s.name === 'Download the render artifact')?.run
    expect(run).toMatch(
      /gh run download "\$RUN_ID"[^\n]*--name "videos-\$\{SCENARIO\}-\$\{RUN_ID\}"/
    )
  })

  it('ffprobe-verifies the renders before anything is written', () => {
    const verify = stepIndex('Verify render encoding (ffprobe)')
    expect(verify).toBeGreaterThan(-1)
    expect(steps[verify]?.run).toContain('npm run -s videos:verify --')
    const firstWrite = steps.findIndex(s =>
      storageWrites.some(w => w.step === s)
    )
    expect(firstWrite).toBeGreaterThan(verify)
  })

  it('builds the destinations with the tested planner', () => {
    const plan = steps.find(s => s.name === 'Plan the objects')?.run ?? ''
    expect(plan).toContain('npx tsx scripts/plan-video-publish.ts')
  })

  it('re-checks every object against the video path shape in shell', () => {
    const shape =
      '^videos/[a-z0-9]+(-[a-z0-9]+)*/[a-z0-9]+([.-][a-z0-9]+)*/[a-z0-9]+(-[a-z0-9]+)*-(desktop|mobile)\\.mp4$'
    for (const s of steps.filter(s => storageWrites.some(w => w.step === s))) {
      expect(s.run, s.name).toContain(shape)
    }
  })

  it('refuses to overwrite: checks staging and prod before the first write', () => {
    const refuse = stepIndex('Refuse to overwrite existing objects')
    expect(refuse).toBeGreaterThan(-1)
    const run = steps[refuse]?.run ?? ''
    expect(run).toContain(
      'for BUCKET in "$GCS_BUCKET" "$GCS_BUCKET_PRODUCTION"'
    )
    expect(run).toContain(
      'gcs-upload.ts exists --bucket "$BUCKET" --object "$OBJ"'
    )
    const firstWrite = steps.findIndex(s =>
      storageWrites.some(w => w.step === s)
    )
    expect(firstWrite).toBeGreaterThan(refuse)
  })

  it('writes only with the upload helper, never gcloud cp/rm/rsync/mv/update/gsutil', () => {
    expect(storageWrites.length).toBe(2)
    for (const { cmd } of storageWrites) {
      expect(cmd).toMatch(/^npx tsx scripts\/gcs-upload\.ts (put|copy) /)
    }
    expect(raw).not.toMatch(/gcloud storage (cp|rsync|mv|rm)/)
    expect(raw).not.toMatch(/invalidate-cdn-cache|url-maps/)
  })

  it('every write: ${OBJ}, mp4 type, the immutable cache header, no gzip, an explicit --on-exists', () => {
    for (const { cmd } of storageWrites) {
      expect(cmd).toContain('--object "$OBJ"')
      expect(cmd).toContain(`--content-type ${VIDEO_CONTENT_TYPE}`)
      expect(cmd).toContain(`--cache-control "${VIDEO_CACHE_CONTROL}"`)
      expect(cmd).toMatch(/--on-exists (skip|fail)\b/)
      expect(cmd).not.toMatch(/\s-Z\b|--gzip/)
    }
  })

  it('a video that already exists fails the publish, at both writes (no skip)', () => {
    for (const { cmd } of storageWrites) {
      expect(cmd).toContain('--on-exists fail')
    }
  })

  it('uploads to staging from the artifact, then copies that object to prod from staging', () => {
    const [up, copy] = storageWrites
    expect(up?.cmd).toMatch(
      /^npx tsx scripts\/gcs-upload\.ts put --bucket "\$GCS_BUCKET" --object "\$OBJ" --file "\$DIR\/\$FILE"/
    )
    expect(copy?.cmd).toMatch(
      /^npx tsx scripts\/gcs-upload\.ts copy --from-bucket "\$GCS_BUCKET" --bucket "\$GCS_BUCKET_PRODUCTION" --object "\$OBJ"/
    )
    expect(wf.env?.['GCS_BUCKET']).toBe('toast-stats-data-staging')
    expect(wf.env?.['GCS_BUCKET_PRODUCTION']).toBe('toast-stats-data-ca')
  })

  it('distinguishes "not found" from every other error in the existence checks (a 403 must not read as absent)', () => {
    const run =
      steps.find(s => s.name === 'Refuse to overwrite existing objects')?.run ??
      ''
    expect(run).not.toMatch(/>\s*\/dev\/null\s+2>&1/)
    expect(run).toMatch(/10\)/)
    expect(run).toMatch(/\*\)[^\n]*exit 1/)
  })

  it('each step that calls the helper mints its own masked token first (tokens last an hour; none is persisted)', () => {
    const callers = steps.filter(s => /gcs-upload\.ts/.test(s.run ?? ''))
    expect(callers.length).toBeGreaterThanOrEqual(2)
    for (const s of callers) {
      const run = s.run ?? ''
      const mint = run.indexOf('print-access-token')
      expect(mint, s.name).toBeGreaterThan(-1)
      expect(run.indexOf('::add-mask::'), s.name).toBeGreaterThan(mint)
      expect(run, s.name).toMatch(/export ACCESS_TOKEN/)
      expect(run.indexOf('export ACCESS_TOKEN'), s.name).toBeLessThan(
        run.indexOf('gcs-upload.ts')
      )
    }
    expect(raw).not.toMatch(
      /ACCESS_TOKEN=.*GITHUB_ENV|>> "\$GITHUB_ENV".*TOKEN/
    )
    expect(raw).not.toMatch(
      /echo[^\n]*\$\{?ACCESS_TOKEN\}?[^\n]*(?<!GITHUB_ENV")$/m
    )
    const authAt = steps.findIndex(s =>
      /google-github-actions\/auth/.test(s.uses ?? '')
    )
    for (const s of callers) expect(steps.indexOf(s)).toBeGreaterThan(authAt)
  })

  it('installs dependencies with --ignore-scripts: no lifecycle script runs while the job holds the OIDC token', () => {
    const run = steps.find(s => s.name === 'Install dependencies')?.run ?? ''
    expect(run).toMatch(/^npm ci --ignore-scripts$/m)
  })

  it('every write step is skipped on a dry run', () => {
    for (const s of steps.filter(s => storageWrites.some(w => w.step === s))) {
      expect(s.if ?? '', s.name).toContain('!inputs.dry_run')
    }
  })

  it('verifies the published objects and the CDN response', () => {
    const run = steps.find(s => s.name === 'Verify the published objects')?.run
    expect(run).toContain('https://cdn.taverns.red/${OBJ}')
    expect(run).toContain(VIDEO_CACHE_CONTROL)
    expect(run).toContain('md5_hash')
    expect(run).toMatch(/206/)
  })
})

describe('media identity (#2972)', () => {
  const authAt = steps.findIndex(s =>
    /google-github-actions\/auth/.test(
      String((s as { uses?: string }).uses ?? '')
    )
  )

  it('signs in as the media identity, not the shared deployer', () => {
    const auth = steps[authAt] as { with?: Record<string, string> }
    expect(auth.with?.['service_account']).toBe('${{ vars.GCP_MEDIA_SA }}')
    expect(raw).not.toMatch(/secrets\.GCP_SERVICE_ACCOUNT/)
  })

  it('checks the media variable is non-empty before it authenticates', () => {
    const guardAt = steps.findIndex(
      s =>
        /vars\.GCP_MEDIA_SA/.test(String(Object.values(s.env ?? {}))) &&
        /-z\b/.test(s.run ?? '') &&
        /exit 1/.test(s.run ?? '')
    )
    expect(guardAt).toBeGreaterThanOrEqual(0)
    expect(guardAt).toBeLessThan(authAt)
  })
})
