/**
 * Workflow contract: the one-off basemap build/upload (#1786, ADR-016).
 *
 * The archive is read by HTTP range requests, so how it is uploaded is
 * load-bearing:
 * - a gzip upload (`-Z`, `--gzip-*`) makes GCS ignore `Range` and serve the
 *   whole multi-GB object on every request (GCS transcoding docs);
 * - a composite upload loses the MD5, and Cloud CDN wants a strong validator
 *   (scripts/gcs-upload.ts inserts one plain object, so the MD5 is kept);
 * - an overwrite would mix two builds in cached CDN chunks, so every write is
 *   create-only (ifGenerationMatch=0, #2972).
 * The workflow is manual-dispatch only and writes prod only by a server-side
 * copy of the staging object. Sourced from the YAML so the guard cannot drift.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { parse } from 'yaml'

const FILE = path.resolve(process.cwd(), '.github/workflows/basemap-build.yml')

interface Step {
  name?: string
  if?: string
  run?: string
  env?: Record<string, string>
  uses?: string
  with?: Record<string, string>
}
interface Workflow {
  on: Record<string, unknown>
  env?: Record<string, string>
  jobs: Record<string, { steps: Step[]; env?: Record<string, string> }>
}

const raw = fs.existsSync(FILE) ? fs.readFileSync(FILE, 'utf-8') : ''
const wf = (raw ? parse(raw) : { on: {}, jobs: {} }) as Workflow
const steps = Object.values(wf.jobs).flatMap(j => j.steps)
/** Each `scripts/gcs-upload.ts put|copy …` command, continuation lines joined. */
const cpCommands = steps.flatMap(s =>
  (s.run ?? '')
    .replace(/\\\n\s*/g, ' ')
    .split('\n')
    .map(l => l.trim())
    .filter(l => /gcs-upload\.ts (put|copy)\b/.test(l))
    .map(cmd => ({ step: s, cmd }))
)

describe('basemap-build.yml (#1786)', () => {
  it('exists and is manual-dispatch only', () => {
    expect(raw).not.toBe('')
    expect(Object.keys(wf.on)).toEqual(['workflow_dispatch'])
  })

  it('takes build date, maxzoom, dry run and a staging|prod-copy target', () => {
    const inputs = (
      wf.on['workflow_dispatch'] as { inputs: Record<string, any> }
    ).inputs
    expect(Object.keys(inputs).sort()).toEqual([
      'build_date',
      'dry_run',
      'maxzoom',
      'target',
    ])
    expect(inputs['target'].type).toBe('choice')
    expect(inputs['target'].options).toEqual(['staging', 'prod-copy'])
    expect(inputs['target'].default).toBe('staging')
  })

  it('builds with the repo script, never an inline extract', () => {
    expect(raw).toContain('scripts/basemap/build-basemap.sh')
    expect(steps.some(s => /pmtiles"? extract/.test(s.run ?? ''))).toBe(false)
  })

  describe('world z0-14 (#2084)', () => {
    const inputs = (
      wf.on['workflow_dispatch'] as { inputs: Record<string, any> }
    ).inputs
    const validate = steps.find(s => s.name === 'Validate inputs')

    it('accepts maxzoom up to 14, and no higher', () => {
      expect(validate?.run ?? '').toMatch(/\(\(MAXZOOM > 14\)\)/)
      expect(validate?.run ?? '').toContain('maxzoom must be 0..14')
    })

    it('keeps the immutable world-z0-<maxzoom>-<date> object name', () => {
      expect(validate?.run ?? '').toContain(
        'OBJ=basemap/protomaps-v4/world-z0-${MAXZOOM}-${BUILD_DATE}.pmtiles'
      )
    })

    it('defaults to a dry run, and every copy is skipped on a dry run', () => {
      expect(inputs['dry_run'].type).toBe('boolean')
      expect(inputs['dry_run'].default).toBe(true)
      for (const { step } of cpCommands) {
        expect(step.if ?? '').toContain('!inputs.dry_run')
      }
    })

    it('gives a 69 GB build time to finish (extract + sha256 + upload)', () => {
      const job = Object.values(wf.jobs)[0] as { 'timeout-minutes'?: number }
      expect(job['timeout-minutes'] ?? 0).toBeGreaterThanOrEqual(180)
    })
  })

  describe('network resilience (#2084, run 38826110491)', () => {
    const job = Object.values(wf.jobs)[0] as {
      'timeout-minutes'?: number
    }
    const env = (k: string) => wf.env?.[k]
    const build = steps.find(s => s.name === 'Build the archive')

    it('retries the extract up to 4 times, 40 minutes per attempt', () => {
      expect(env('PMTILES_EXTRACT_ATTEMPTS')).toBe('4')
      expect(env('PMTILES_EXTRACT_TIMEOUT')).toBe('40m')
    })

    it('job timeout covers every attempt plus upload, and stays <= 360', () => {
      const t = job['timeout-minutes'] ?? 0
      // 4 x 40 min extract + backoff + verify/sha256 + upload (~25 min).
      expect(t).toBeGreaterThanOrEqual(4 * 40 + 30)
      expect(t).toBeLessThanOrEqual(360)
    })

    it('forces HTTP/1.1 in the Go client (the HTTP/2 INTERNAL_ERROR)', () => {
      expect(env('GODEBUG')).toBe('http2client=0')
    })

    it('reads the source through the resuming range proxy', () => {
      expect(env('BASEMAP_RANGE_PROXY')).toBe('1')
      expect(build?.run ?? '').toContain('scripts/basemap/build-basemap.sh')
    })

    it('sets up the pinned Node the proxy runs on, before the build', () => {
      const i = steps.findIndex(s =>
        String((s as { uses?: string }).uses ?? '').startsWith(
          'actions/setup-node@'
        )
      )
      expect(i).toBeGreaterThanOrEqual(0)
      const setup = steps[i] as { with?: Record<string, string> }
      expect(setup.with?.['node-version-file']).toBe('.nvmrc')
      expect(i).toBeLessThan(steps.indexOf(build!))
    })
  })

  it('has the copy commands under test (guard is not vacuous)', () => {
    expect(cpCommands.length).toBeGreaterThanOrEqual(2)
  })

  it('every write: octet-stream, no-transform, an explicit --on-exists, never gzip', () => {
    for (const { cmd } of cpCommands) {
      expect(cmd).toContain('--content-type application/octet-stream')
      expect(cmd).toContain(
        '--cache-control "public, max-age=86400, no-transform"'
      )
      expect(cmd).toMatch(/--on-exists (skip|fail)\b/)
      expect(cmd).not.toMatch(/\s-[A-Za-z]*[Zz]\b|--gzip|\s-[jJ]\b/)
    }
  })

  it('never uses gcloud storage cp (it reads and lists the destination first)', () => {
    expect(raw).not.toMatch(/gcloud storage (cp|rsync|mv|rm)/)
  })

  it('staging upload fails if the object exists; the prod copy skips (a re-run verifies it)', () => {
    const up = cpCommands.find(({ cmd }) => /gcs-upload\.ts put /.test(cmd))
    expect(up?.cmd).toContain('--on-exists fail')
    const copy = cpCommands.find(({ cmd }) => /gcs-upload\.ts copy /.test(cmd))
    expect(copy?.cmd).toContain('--on-exists skip')
  })

  it('writes prod only by a copy read from staging, only for prod-copy', () => {
    const prod = cpCommands.filter(({ cmd }) =>
      /GCS_BUCKET_PRODUCTION/.test(cmd)
    )
    expect(prod.length).toBeGreaterThanOrEqual(1)
    for (const { step, cmd } of prod) {
      expect(step.if ?? '').toContain("inputs.target == 'prod-copy'")
      expect(cmd).toMatch(
        /gcs-upload\.ts copy --from-bucket "\$GCS_BUCKET" --bucket "\$GCS_BUCKET_PRODUCTION" --object "\$OBJ"/
      )
    }
    const uploads = cpCommands.filter(({ cmd }) =>
      /gcs-upload\.ts put /.test(cmd)
    )
    expect(uploads.length).toBe(1)
    for (const { step, cmd } of uploads) {
      expect(cmd).not.toMatch(/GCS_BUCKET_PRODUCTION/)
      expect(cmd).toContain('--file "$BUILD_DIR/$NAME"')
      expect(step.if ?? '').toContain("inputs.target == 'staging'")
    }
  })

  it('the staging existence check tells "not found" apart from every other error', () => {
    const run =
      steps.find(
        s => s.name === 'Refuse to overwrite an existing staging object'
      )?.run ?? ''
    expect(run).toContain('gcs-upload.ts exists')
    expect(run).not.toMatch(/>\s*\/dev\/null\s+2>&1/)
    expect(run).toMatch(/10\)/)
    expect(run).toMatch(/\*\)[^\n]*exit 1/)
  })

  it('installs dependencies with --ignore-scripts for both targets, after Node is set up', () => {
    const node = steps.findIndex(s =>
      String(s.uses ?? '').startsWith('actions/setup-node@')
    )
    const install = steps.findIndex(s =>
      /^npm ci --ignore-scripts$/m.test(s.run ?? '')
    )
    expect(node).toBeGreaterThanOrEqual(0)
    expect(install).toBeGreaterThan(node)
    expect(steps[node]?.if).toBeUndefined()
    expect(steps[install]?.if).toBeUndefined()
  })

  it('hands the job token to the helper through a masked environment variable, never echoed', () => {
    const at = steps.findIndex(
      s =>
        /print-access-token/.test(s.run ?? '') && /GITHUB_ENV/.test(s.run ?? '')
    )
    expect(at).toBeGreaterThan(-1)
    expect(steps[at]?.run).toContain('::add-mask::')
    const authAt = steps.findIndex(s =>
      /google-github-actions\/auth/.test(s.uses ?? '')
    )
    expect(at).toBeGreaterThan(authAt)
  })

  it('only ever writes under basemap/', () => {
    expect(raw).toMatch(/OBJ=.*basemap\/protomaps-v4\//)
    expect(raw).not.toMatch(/gcloud storage (rm|rsync)/)
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
