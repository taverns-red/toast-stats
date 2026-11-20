/**
 * #3103 — the one-off legacy-suspension-deadlines workflow. It reads the
 * 2024-25 month-end district files from the STAGING bucket, writes
 * config/legacy-suspension-deadlines.json to staging, and prints what it read
 * (object count, bytes) and what it wrote (row count, sha256). Manual
 * dispatch only; it never touches prod and shares the pipeline's
 * concurrency group so it can't overlap a run.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import * as path from 'node:path'
import { parse as parseYaml } from 'yaml'

const REPO = process.cwd()
const FILE = '.github/workflows/legacy-suspension-deadlines.yml'

interface Step {
  name?: string
  run?: string
  uses?: string
  with?: Record<string, unknown>
}
interface Workflow {
  on: Record<string, unknown>
  permissions: Record<string, string>
  concurrency: { group: string; 'cancel-in-progress': boolean }
  jobs: Record<string, { steps: Step[] }>
}

describe('legacy-suspension-deadlines.yml (#3103)', () => {
  const text = readFileSync(path.join(REPO, FILE), 'utf-8')
  const wf = parseYaml(text) as Workflow
  const steps = Object.values(wf.jobs).flatMap(j => j.steps)
  const runs = steps.map(s => s.run ?? '').join('\n')

  it('runs on manual dispatch only', () => {
    expect(Object.keys(wf.on)).toEqual(['workflow_dispatch'])
  })

  it('asks only for read access to the repo and an id token', () => {
    expect(wf.permissions).toEqual({ contents: 'read', 'id-token': 'write' })
  })

  it('shares the data-pipeline concurrency group and never cancels it', () => {
    expect(wf.concurrency).toEqual({
      group: 'data-pipeline',
      'cancel-in-progress': false,
    })
  })

  it('signs in as the pipeline identity, like the other one-off jobs', () => {
    const auth = steps.find(s =>
      (s.uses ?? '').startsWith('google-github-actions/auth@')
    )
    expect(auth?.with).toEqual({
      workload_identity_provider:
        '${{ secrets.GCP_WORKLOAD_IDENTITY_PROVIDER }}',
      service_account: '${{ vars.GCP_PIPELINE_SA }}',
    })
  })

  it('reads and writes the staging bucket only, never prod', () => {
    expect(text).toContain('toast-stats-data-staging')
    expect(text).not.toMatch(/toast-stats-data-ca\b/)
    expect(runs).toMatch(
      /gs:\/\/\$\{BUCKET\}\/config\/legacy-suspension-deadlines\.json/
    )
  })

  it('prints the bytes it reads and the row count and checksum it writes', () => {
    expect(runs).toMatch(/build-legacy-suspension-deadlines\.ts plan/)
    expect(runs).toMatch(/build-legacy-suspension-deadlines\.ts build/)
    for (const key of ['count', 'bytes', 'rowCount', 'rowsSha256']) {
      expect(runs).toContain(`.${key}`)
    }
  })

  it('defaults to a dry run, so a dispatch uploads only on purpose (#3109 review)', () => {
    const dispatch = wf.on['workflow_dispatch'] as {
      inputs: { dry_run: { default: boolean } }
    }
    expect(dispatch.inputs.dry_run.default).toBe(true)
  })

  it('checks the row count and checksum against the committed file before uploading (#3109 review)', () => {
    const names = steps.map(s => s.name ?? '')
    const check = steps.find(s =>
      /build-legacy-suspension-deadlines\.ts verify/.test(s.run ?? '')
    )
    expect(check).toBeDefined()
    expect(check!.run).toContain(
      '--expected scripts/legacy-suspension-deadlines.expected.json'
    )
    // The check never skips on a dry run, and runs before the upload.
    expect((check as { if?: string }).if).toBeUndefined()
    expect(names.indexOf(check!.name!)).toBeLessThan(
      names.indexOf('Upload to staging')
    )
    // No inline row count or checksum in the workflow.
    expect(text).not.toMatch(/\b1303\b|40692ca8/)
  })

  it('keeps the file as an artifact', () => {
    expect(
      steps.some(s => (s.uses ?? '').startsWith('actions/upload-artifact@'))
    ).toBe(true)
  })
})
