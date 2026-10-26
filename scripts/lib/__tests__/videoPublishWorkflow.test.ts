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
 * - every write is `--no-clobber` with video/mp4 and the immutable cache
 *   header; existing objects are refused before anything is written;
 * - prod gets a server-side copy of the verified staging object;
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
  /\bgcloud storage (cp|rsync|mv|rm)\b|\bobjects update\b|\bgsutil\b/.test(
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
    expect(run).toContain('gs://${GCS_BUCKET}/${OBJ}')
    expect(run).toContain('gs://${GCS_BUCKET_PRODUCTION}/${OBJ}')
    expect(run).toContain('objects describe')
    const firstWrite = steps.findIndex(s =>
      storageWrites.some(w => w.step === s)
    )
    expect(firstWrite).toBeGreaterThan(refuse)
  })

  it('writes only with gcloud storage cp, never rm/rsync/mv/update/gsutil', () => {
    expect(storageWrites.length).toBe(2)
    for (const { cmd } of storageWrites) {
      expect(cmd).toMatch(/^gcloud storage cp /)
    }
    expect(raw).not.toMatch(/invalidate-cdn-cache|url-maps/)
  })

  it('every write lands on ${OBJ} with no-clobber, mp4 type and the immutable cache header', () => {
    for (const { cmd } of storageWrites) {
      expect(cmd).toMatch(/"gs:\/\/\$\{GCS_BUCKET(_PRODUCTION)?\}\/\$\{OBJ\}"/)
      expect(cmd).toContain('--no-clobber')
      expect(cmd).toContain(`--content-type=${VIDEO_CONTENT_TYPE}`)
      expect(cmd).toContain(`--cache-control="${VIDEO_CACHE_CONTROL}"`)
      expect(cmd).not.toMatch(/\s-Z\b|--gzip/)
    }
  })

  it('uploads to staging, then copies that object to prod server side', () => {
    const [up, copy] = storageWrites
    expect(up?.cmd).toMatch(
      /^gcloud storage cp "\$DIR\/\$FILE" "gs:\/\/\$\{GCS_BUCKET\}\/\$\{OBJ\}"/
    )
    expect(copy?.cmd).toMatch(
      /^gcloud storage cp "gs:\/\/\$\{GCS_BUCKET\}\/\$\{OBJ\}" "gs:\/\/\$\{GCS_BUCKET_PRODUCTION\}\/\$\{OBJ\}"/
    )
    expect(wf.env?.['GCS_BUCKET']).toBe('toast-stats-data-staging')
    expect(wf.env?.['GCS_BUCKET_PRODUCTION']).toBe('toast-stats-data-ca')
    expect(wf.env?.['CLOUDSDK_STORAGE_PARALLEL_COMPOSITE_UPLOAD_ENABLED']).toBe(
      'False'
    )
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
