/**
 * #2239 — the `fac_prior_root` dispatch input. A rebuild can carry FAC
 * fields from the private recovery bucket instead of the live (stripped)
 * staging copy. The value is checked once, by scripts/pipeline/
 * fac-prior-root.sh, against an exact allowlist: the workflow calls it in
 * the Determine-mode step (so a bad value fails the run before any stage),
 * and process-dates.sh calls it again on the FAC_PRIOR_ROOT it is handed.
 */
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { parse } from 'yaml'

const REPO = process.cwd()
const SCRIPT = path.join(REPO, 'scripts/pipeline/fac-prior-root.sh')
const ROOT = 'gs://toast-stats-fac-recovery-2239/fac-2239'

function check(mode: string, value: string) {
  const r = spawnSync('bash', [SCRIPT, mode, value], { encoding: 'utf-8' })
  return { status: r.status, stdout: r.stdout, stderr: r.stderr }
}

interface Step {
  name?: string
  id?: string
  if?: string
  run?: string
  env?: Record<string, string>
}

const workflow = parse(
  fs.readFileSync(
    path.join(REPO, '.github/workflows/data-pipeline.yml'),
    'utf-8'
  )
) as {
  on: {
    workflow_dispatch: {
      inputs: Record<string, { type?: string; default?: unknown }>
    }
  }
  jobs: Record<string, { steps?: Step[] }>
}
const steps = workflow.jobs.pipeline.steps ?? []

describe('fac-prior-root.sh', () => {
  it('prints the allowlisted root in rebuild mode', () => {
    expect(check('rebuild', ROOT)).toMatchObject({
      status: 0,
      stdout: `${ROOT}\n`,
    })
  })

  it('prints nothing for an empty value, in any mode', () => {
    for (const mode of ['daily', 'rebuild', 'rescrape', 'prune']) {
      expect(check(mode, '')).toMatchObject({ status: 0, stdout: '' })
    }
  })

  it('refuses the root outside rebuild mode', () => {
    for (const mode of ['daily', 'rescrape', 'rescrape-historical', 'prune']) {
      const r = check(mode, ROOT)
      expect(r.status, mode).toBe(2)
      expect(r.stdout).toBe('')
    }
  })

  it('refuses anything but the exact allowlisted root', () => {
    for (const bad of [
      'gs://toast-stats-data-staging/snapshots',
      'gs://toast-stats-data-ca/snapshots',
      `${ROOT}/`,
      `${ROOT}/2026-06-15`,
      `${ROOT}/../snapshots`,
      'gs://toast-stats-fac-recovery-2239',
      ` ${ROOT}`,
      `${ROOT}; rm -rf /`,
    ]) {
      const r = check('rebuild', bad)
      expect(r.status, bad).toBe(2)
      expect(r.stdout).toBe('')
    }
  })
})

describe('data-pipeline.yml: the fac_prior_root input', () => {
  it('is an optional string input, empty by default', () => {
    const input = workflow.on.workflow_dispatch.inputs['fac_prior_root']
    expect(input).toMatchObject({ type: 'string', default: '' })
  })

  it('is validated in the Determine-mode step, through env, never inline', () => {
    const mode = steps.find(s => s.id === 'mode')!
    expect(mode.env?.['FAC_PRIOR_ROOT_INPUT']).toBe(
      '${{ inputs.fac_prior_root }}'
    )
    expect(mode.run).not.toContain('inputs.fac_prior_root')
    expect(mode.run).toContain(
      'bash scripts/pipeline/fac-prior-root.sh "${MODE}" "${FAC_PRIOR_ROOT_INPUT}"'
    )
    expect(mode.run).toContain(
      'echo "fac_prior_root=${FAC_PRIOR_ROOT}" >> "$GITHUB_OUTPUT"'
    )
    // Its checkout precedes it, so the script exists when it runs.
    expect(steps.findIndex(s => s.name === 'Checkout code')).toBeLessThan(
      steps.indexOf(mode)
    )
  })

  it('reaches only the rebuild runner, as FAC_PRIOR_ROOT', () => {
    const rebuild = steps.find(
      s => s.name === '[rebuild] Stream rebuild — one date at a time'
    )!
    expect(rebuild.env?.['FAC_PRIOR_ROOT']).toBe(
      '${{ steps.mode.outputs.fac_prior_root }}'
    )
    const readers = steps.filter(s =>
      JSON.stringify(s).includes('fac_prior_root')
    )
    expect(readers.map(s => s.id ?? s.name).sort()).toEqual(
      ['[rebuild] Stream rebuild — one date at a time', 'mode'].sort()
    )
  })
})
