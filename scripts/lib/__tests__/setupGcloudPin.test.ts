/**
 * Workflow guard: every `setup-gcloud` step pins an exact Cloud SDK version
 * of at least 576.0.0, and logs `gcloud version` right after (#1720, #1702 D2).
 *
 * `setup-gcloud@v3` with no `version:` (or `latest`) resolves from
 * setup-cloud-sdk's `data/versions.json`, which stopped at 568.0.0 in
 * 2026-05. gcloud 576.0.0 is the release that made `gcloud storage rsync`
 * decompress gzip downloads by default; on 568 the runner's rsync kept the
 * stored gzip bytes and the `-Z` upload stacked a layer a run (#1702). A
 * range (`>= 576.0.0`) does not resolve while that manifest stops at 568, so
 * only an exact pin is accepted. Bump it deliberately.
 *
 * Sourced from the workflow YAML so the guard cannot drift from the steps.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { parse } from 'yaml'

const WORKFLOW_DIR = path.resolve(process.cwd(), '.github/workflows')

/** First release whose `gcloud storage rsync` decompresses gzip downloads. */
const MIN_MAJOR = 576

interface Step {
  name?: string
  uses?: string
  run?: string
  with?: Record<string, unknown>
}

interface SetupSite {
  file: string
  job: string
  step: Step
  next: Step | undefined
}

/** Why `version` is not an acceptable pin, or null when it is. */
function pinViolation(version: unknown): string | null {
  if (version === undefined || version === null) {
    return 'no `version:` (resolves to the stale manifest latest, 568.0.0)'
  }
  const v = String(version).trim()
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v)
  if (!m) return `\`version: ${v}\` is not an exact X.Y.Z release`
  if (Number(m[1]) < MIN_MAJOR) {
    return `\`version: ${v}\` is below ${MIN_MAJOR}.0.0 (rsync keeps gzip bytes)`
  }
  return null
}

function setupGcloudSites(): SetupSite[] {
  const out: SetupSite[] = []
  for (const file of fs.readdirSync(WORKFLOW_DIR)) {
    if (!/\.ya?ml$/.test(file)) continue
    const wf = parse(
      fs.readFileSync(path.join(WORKFLOW_DIR, file), 'utf-8')
    ) as {
      jobs?: Record<string, { steps?: Step[] }>
    }
    for (const [job, def] of Object.entries(wf.jobs ?? {})) {
      const steps = def.steps ?? []
      steps.forEach((step, i) => {
        if (step.uses?.startsWith('google-github-actions/setup-gcloud@')) {
          out.push({ file, job, step, next: steps[i + 1] })
        }
      })
    }
  }
  return out
}

describe('pinViolation', () => {
  it.each([
    [undefined],
    ['latest'],
    ['>= 576.0.0'],
    ['568.0.0'],
    ['575.9.9'],
    ['588'],
  ])('rejects %s', v => {
    expect(pinViolation(v)).not.toBeNull()
  })

  it.each([['576.0.0'], ['588.0.0'], ['600.1.2']])('accepts %s', v => {
    expect(pinViolation(v)).toBeNull()
  })
})

describe('setup-gcloud steps (#1720)', () => {
  const sites = setupGcloudSites()

  it('finds the setup-gcloud steps (guard is not vacuous)', () => {
    expect(sites.length).toBeGreaterThanOrEqual(4)
    expect(sites.filter(s => s.file === 'data-pipeline.yml').length).toBe(4)
  })

  it('pins an exact Cloud SDK version >= 576.0.0 on every step', () => {
    const bad = sites
      .map(s => ({ s, why: pinViolation(s.step.with?.['version']) }))
      .filter(x => x.why !== null)
      .map(x => `${x.s.file} job ${x.s.job}: ${x.why}`)
    expect(bad).toEqual([])
  })

  it('logs `gcloud version` in the step right after every setup-gcloud', () => {
    const bad = sites
      .filter(s => !/\bgcloud version\b/.test(s.next?.run ?? ''))
      .map(s => `${s.file} job ${s.job}`)
    expect(bad).toEqual([])
  })
})
