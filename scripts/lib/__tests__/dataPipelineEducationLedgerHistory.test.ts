/**
 * Workflow contract: the `backfill-education-ledger` mode (#1802).
 *
 * The education ledger history (2003-04 → 2018-19) is fetched in CI, never
 * locally, into the staging-only raw prefix `raw-education-ledger/`. The
 * contract the YAML must keep:
 *
 * - it runs in its OWN job, and the main `pipeline` job is skipped for it, so
 *   none of the generic tail (CDN manifests, gates, promote, CDN purge) runs:
 *   nothing here can be promoted until it is reviewed and #1763 lands;
 * - the runner starts empty (R2), so it resumes from what staging holds
 *   before fetching;
 * - every upload goes through gcs-upload.sh into the run manifest (ADR-015
 *   P5), per program year (a timeout keeps what finished), never to prod,
 *   never `-Z` (no #1702 gzip round-trip on resume);
 * - dispatch inputs reach the script through env, not `${{ }}` in the body.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { parse } from 'yaml'
import { prodWriteReasons } from '../prodWriteGuard.js'

const WORKFLOW_PATH = path.resolve(
  process.cwd(),
  '.github/workflows/data-pipeline.yml'
)

interface Step {
  name?: string
  id?: string
  if?: string
  run?: string
  uses?: string
  env?: Record<string, string>
}
interface Job {
  if?: string
  'timeout-minutes'?: number | string
  steps?: Step[]
}

const source = fs.readFileSync(WORKFLOW_PATH, 'utf-8')
const workflow = parse(source) as {
  on: {
    workflow_dispatch: {
      inputs: Record<string, { options?: string[] }>
    }
  }
  jobs: Record<string, Job>
}
const MODE = 'backfill-education-ledger'
const job = workflow.jobs['education-ledger-history']
const steps = job?.steps ?? []
const runOf = (pred: (s: Step) => boolean) =>
  steps.filter(pred).map(s => s.run ?? '')
const allRuns = steps.map(s => s.run ?? '').join('\n')

describe(`data-pipeline ${MODE} mode (#1802)`, () => {
  it('is a dispatchable mode', () => {
    expect(workflow.on.workflow_dispatch.inputs.mode?.options).toContain(MODE)
  })

  it('runs in its own job, gated on the mode', () => {
    expect(job).toBeDefined()
    expect(job?.if).toBe(`inputs.mode == '${MODE}'`)
  })

  it('skips the main pipeline job, so no gate, promote or CDN purge runs for it', () => {
    expect(workflow.jobs.pipeline?.if).toContain(`inputs.mode != '${MODE}'`)
  })

  it('has room for ~1,550 requests at >=1.1 s (≈80 min) but is bounded', () => {
    expect(Number(job?.['timeout-minutes'])).toBeGreaterThanOrEqual(180)
    expect(Number(job?.['timeout-minutes'])).toBeLessThanOrEqual(300)
  })

  it('pins the Cloud SDK like every other job', () => {
    const setup = steps.find(s =>
      (s.uses ?? '').startsWith('google-github-actions/setup-gcloud')
    )
    expect(setup).toBeDefined()
  })

  it('resumes from staging before fetching (R2: the runner starts empty)', () => {
    const resumeIdx = steps.findIndex(s =>
      /gcloud storage rsync -r "gs:\/\/\$\{GCS_BUCKET\}\/raw-education-ledger\/"/.test(
        s.run ?? ''
      )
    )
    const fetchIdx = steps.findIndex(s =>
      (s.run ?? '').includes('backfill-education-ledger-history')
    )
    expect(resumeIdx).toBeGreaterThanOrEqual(0)
    expect(fetchIdx).toBeGreaterThan(resumeIdx)
  })

  it('fetches one program year at a time and uploads each through gcs-upload.sh to staging', () => {
    const [fetch] = runOf(s =>
      (s.run ?? '').includes('backfill-education-ledger-history')
    )
    expect(fetch).toMatch(/for PY in/)
    expect(fetch).toMatch(/--program-years "\$\{PY\}"/)
    expect(fetch).toContain(
      'bash scripts/pipeline/gcs-upload.sh education-ledger-history rsync -r'
    )
    expect(fetch).toContain('"gs://${GCS_BUCKET}/raw-education-ledger/${PY}/"')
  })

  it('never uploads with a raw gcloud call, never -Z, never to prod', () => {
    // A raw `gcloud storage cp|rsync|mv` may only DOWNLOAD (resume) or
    // publish the run manifest itself; any other bucket destination is an
    // unrecorded upload.
    const rawUploads = allRuns
      .replace(/\\\r?\n/g, ' ')
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => !l.startsWith('#'))
      .flatMap(l => {
        const m = /gcloud storage (?:cp|rsync|mv)\b.*/.exec(l)
        return m ? [m[0].split(/\s(?:\|\||&&|\||;|\d?>>?)\s?/)[0]!.trim()] : []
      })
      .filter(cmd => {
        const dest = cmd.split(/\s+/).pop() ?? ''
        return dest.startsWith('"gs://') && !dest.includes('/runs/')
      })
    expect(rawUploads).toEqual([])
    expect(allRuns).not.toMatch(/\s-Z\b/)
    for (const s of steps) expect(prodWriteReasons(s.run ?? '')).toEqual([])
  })

  it('takes dispatch inputs through env, not ${{ }} in the script body', () => {
    const [fetch] = steps.filter(s =>
      (s.run ?? '').includes('backfill-education-ledger-history')
    )
    expect(fetch?.run).not.toMatch(/\$\{\{\s*inputs\./)
    expect(Object.values(fetch?.env ?? {}).join(' ')).toMatch(
      /inputs\.program_year/
    )
  })

  it('publishes its run manifest even after a failed step', () => {
    const publish = steps.find(s =>
      (s.run ?? '').includes('runs/${GITHUB_RUN_ID}/written.jsonl')
    )
    expect(publish?.if).toContain('!cancelled()')
  })
})
