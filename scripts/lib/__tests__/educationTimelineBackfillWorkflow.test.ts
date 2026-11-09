/**
 * Workflow contract: the dispatchable education-timeline backfill (#2591).
 *
 * It writes CDN-adjacent objects outside the daily pipeline, so, like the
 * gap-district prune (#2038):
 * - it is manual-dispatch only;
 * - it shares the `data-pipeline` concurrency group (it never overlaps a
 *   pipeline run or the daily rollup step) and never cancels one;
 * - it can only ever touch staging: the bucket is a literal, not an input,
 *   and neither the prod bucket nor a prod environment is referenced (#1755);
 * - `upload` is a boolean defaulting to false, normalized once (#1133);
 * - the program year is validated before use;
 * - RUN_MANIFEST_FILE is set and the manifest is uploaded as an artifact.
 * Sourced from the YAML so the guard cannot drift.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { parse } from 'yaml'

const FILE = path.resolve(
  process.cwd(),
  '.github/workflows/education-timeline-backfill.yml'
)

interface Step {
  name?: string
  if?: string
  uses?: string
  run?: string
  with?: Record<string, unknown>
  env?: Record<string, string>
}
interface Input {
  type?: string
  default?: unknown
  options?: string[]
  required?: boolean
}
interface Job {
  environment?: unknown
  env?: Record<string, string>
  steps: Step[]
}
interface Workflow {
  on: Record<string, { inputs?: Record<string, Input> } | null>
  concurrency?: { group?: string; 'cancel-in-progress'?: boolean }
  env?: Record<string, string>
  permissions?: Record<string, string>
  jobs: Record<string, Job>
}

const raw = fs.existsSync(FILE) ? fs.readFileSync(FILE, 'utf-8') : ''
const wf = (raw ? parse(raw) : { on: {}, jobs: {} }) as Workflow
const jobs = Object.values(wf.jobs)
const steps = jobs.flatMap(j => j.steps ?? [])
const backfill = () =>
  steps.find(s => (s.run ?? '').includes('backfill-education-timeline.sh'))

describe('education-timeline-backfill.yml', () => {
  it('exists', () => {
    expect(raw).not.toBe('')
  })

  it('is manual-dispatch only', () => {
    expect(Object.keys(wf.on)).toEqual(['workflow_dispatch'])
  })

  it('shares the data-pipeline concurrency group and never cancels it', () => {
    expect(wf.concurrency).toEqual({
      group: 'data-pipeline',
      'cancel-in-progress': false,
    })
  })

  it('takes program_year and an upload boolean defaulting to false, and no bucket', () => {
    const inputs = wf.on.workflow_dispatch?.inputs ?? {}
    expect(Object.keys(inputs).sort()).toEqual(['program_year', 'upload'])
    expect(inputs.program_year).toMatchObject({
      type: 'string',
      required: true,
    })
    expect(inputs.program_year?.default).toBeUndefined()
    expect(inputs.upload).toMatchObject({ type: 'boolean', default: false })
  })

  it('validates program_year as consecutive-looking YYYY-YYYY before use', () => {
    const step = steps.find(s => (s.run ?? '').includes('^[0-9]{4}-[0-9]{4}$'))
    expect(step).toBeDefined()
    expect(step!.env?.PROGRAM_YEAR).toBe('${{ inputs.program_year }}')
  })

  it('writes to the hard-coded staging bucket and never references prod', () => {
    expect(raw).toContain('toast-stats-data-staging')
    expect(raw).not.toContain('toast-stats-data-ca')
    expect(raw).not.toMatch(/GCS_BUCKET_PRODUCTION/)
    expect(raw).not.toMatch(/--education-rollup|promote-run-manifest/)
    for (const job of jobs) expect(job.environment).toBeUndefined()
    const step = backfill()!
    expect(step).toBeDefined()
    expect(step.run).toContain('"${GCS_BUCKET}"')
    expect(raw).not.toMatch(/inputs\.bucket/)
  })

  it('passes inputs through env, never interpolated into a script', () => {
    for (const s of steps) expect(s.run ?? '').not.toContain('${{')
    const step = backfill()!
    expect(step.env?.UPLOAD).toBe('${{ inputs.upload }}')
    expect(step.env?.PROGRAM_YEAR).toBe('${{ inputs.program_year }}')
  })

  it('passes --upload only when upload is explicitly true (string, #1133)', () => {
    const step = backfill()!
    expect(step.run).toMatch(/"\$\{UPLOAD\}" = "true"/)
    expect(step.run).toContain('--upload')
    expect(raw).not.toMatch(/inputs\.upload\s*[!=]=\s*'/)
  })

  it('sets RUN_MANIFEST_FILE and uploads the manifest as an artifact', () => {
    expect(JSON.stringify([wf.env, ...jobs.map(j => j.env)])).toContain(
      'RUN_MANIFEST_FILE'
    )
    const upload = steps.find(s =>
      s.uses?.startsWith('actions/upload-artifact@')
    )
    expect(upload).toBeDefined()
    expect(upload!.if).toBe('always()')
  })

  it('authenticates with workload identity and a pinned Cloud SDK', () => {
    expect(
      steps.some(s => s.uses?.startsWith('google-github-actions/auth@'))
    ).toBe(true)
    expect(
      steps.some(s => s.uses?.startsWith('google-github-actions/setup-gcloud@'))
    ).toBe(true)
  })

  it('writes an object count to the step summary', () => {
    const all = steps.map(s => s.run ?? '').join('\n')
    expect(all).toContain('GITHUB_STEP_SUMMARY')
    expect(all).toMatch(/objects/i)
  })
})
