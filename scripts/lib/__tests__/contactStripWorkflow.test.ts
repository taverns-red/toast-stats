/**
 * Workflow contract: the one-off contact strip (#2026, cleanup plan
 * 2026-10-14 §3 step 3).
 *
 * It rewrites CDN-served objects outside the pipeline, so:
 * - it is manual-dispatch only;
 * - it shares the `data-pipeline` concurrency group, so it can never overlap
 *   a pipeline run (and never cancels one);
 * - dry run is the default, and only an explicit `dry_run=false` passes
 *   `--execute`; the boolean is normalized to a string once (#1133);
 * - the bucket is a choice of exactly staging | prod;
 * - the audit manifest is always uploaded as an artifact.
 * Sourced from the YAML so the guard cannot drift.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { parse } from 'yaml'

const FILE = path.resolve(process.cwd(), '.github/workflows/contact-strip.yml')

interface Step {
  name?: string
  id?: string
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
interface Workflow {
  on: Record<string, { inputs?: Record<string, Input> } | null>
  concurrency?: { group?: string; 'cancel-in-progress'?: boolean }
  permissions?: Record<string, string>
  jobs: Record<string, { steps: Step[] }>
}

const raw = fs.existsSync(FILE) ? fs.readFileSync(FILE, 'utf-8') : ''
const wf = (raw ? parse(raw) : { on: {}, jobs: {} }) as Workflow
const steps = Object.values(wf.jobs).flatMap(j => j.steps ?? [])
const runs = steps.map(s => s.run ?? '').join('\n')

describe('contact-strip.yml', () => {
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

  it('takes bucket (staging|prod), dates and dry_run defaulting to true', () => {
    const inputs = wf.on.workflow_dispatch?.inputs ?? {}
    expect(inputs.bucket).toMatchObject({
      type: 'choice',
      options: ['staging', 'prod'],
      default: 'staging',
    })
    expect(inputs.dates?.type).toBe('string')
    expect(inputs.dates?.default).toBe(
      // #2069: 10-14 carries place links (no contact keys).
      '2026-06-30,2026-10-09,2026-10-10,2026-10-11,2026-10-12,2026-10-13,2026-10-14'
    )
    expect(inputs.dry_run).toMatchObject({ type: 'boolean', default: true })
  })

  it('passes --execute only when dry_run is explicitly false', () => {
    const strip = steps.find(s => (s.run ?? '').includes('strip-club-contact'))
    expect(strip).toBeDefined()
    expect(strip!.run).toMatch(/"\$\{DRY_RUN\}" = "false"/)
    expect(strip!.run).toContain('--execute')
    // The boolean reaches the shell as a string, compared to a string.
    expect(strip!.env?.DRY_RUN).toBe('${{ inputs.dry_run }}')
    expect(runs).not.toMatch(/inputs\.dry_run\s*[!=]=\s*'/)
  })

  it('passes the inputs through env, never interpolated into the script', () => {
    const strip = steps.find(s => (s.run ?? '').includes('strip-club-contact'))!
    expect(strip.run).not.toContain('${{')
    expect(strip.env?.BUCKET).toBe('${{ inputs.bucket }}')
    expect(strip.env?.DATES).toBe('${{ inputs.dates }}')
  })

  it('authenticates with workload identity and needs no gcloud CLI', () => {
    expect(
      steps.some(s => s.uses?.startsWith('google-github-actions/auth@'))
    ).toBe(true)
    expect(steps.some(s => s.uses?.includes('setup-gcloud'))).toBe(false)
    expect(runs).not.toMatch(/\bgcloud\b|\bgsutil\b/)
  })

  it('always uploads the audit manifest as an artifact', () => {
    const upload = steps.find(s =>
      s.uses?.startsWith('actions/upload-artifact@')
    )
    expect(upload).toBeDefined()
    expect(upload!.if).toBe('always()')
    expect(String(upload!.with?.path)).toContain('contact-strip.jsonl')
  })

  it('reports the place-link count in the step summary (#2069)', () => {
    expect(runs).toContain('placeValuesScrubbed')
  })

  it('keeps the audit copy in staging only on a real run', () => {
    const strip = steps.find(s => (s.run ?? '').includes('strip-club-contact'))!
    expect(strip.run).toContain('--audit-object')
    expect(strip.run).toMatch(/runs\/\$\{GITHUB_RUN_ID\}\/contact-strip\.jsonl/)
  })
})
