/**
 * backfill-global-totals fails the run on a failed date unless the operator
 * passed `allow_partial`, through scripts/partial-failure-gate.sh (#1771,
 * ADR-015 P7, audit D-26).
 *
 * The backfill used to fail only when NO date succeeded (`SUCCEEDED == 0`),
 * the rule every per-date mode had before #1708 (decision D7). A run with
 * nine good dates and one failed one went green and promoted, and the hole
 * surfaced months later as a missing row in the worldwide history.
 *
 * Runs the workflow step's REAL run block, extracted from the YAML, against
 * the gcloud shim (a temp directory standing in for both buckets, D10) and a
 * stand-in `npx tsx scripts/build-global-totals.ts` that reproduces only the
 * builder's documented contract: write <snapshot-dir>/global-totals.json and
 * print its one-line summary JSON on stdout (the keys the real script prints),
 * or exit 1 without publishing.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { parse } from 'yaml'

const REPO = process.cwd()
const WORKFLOW_PATH = path.join(REPO, '.github/workflows/data-pipeline.yml')
const SHIM = path.join(
  REPO,
  'scripts/lib/__tests__/fixtures/gcloud-shim/gcloud'
)
const STEP_NAME = '[backfill] Build global-totals.json one date at a time'
const STAGING = 'staging-bucket'
const PRODUCTION = 'production-bucket'

interface Step {
  name?: string
  run?: string
  env?: Record<string, string>
}

const workflow = parse(fs.readFileSync(WORKFLOW_PATH, 'utf-8')) as {
  jobs: Record<string, { steps?: Step[] }>
}
const backfill = (workflow.jobs.pipeline.steps ?? []).find(
  s => s.name === STEP_NAME
)

/** Logical code lines: comments and blank lines dropped. */
function codeLines(run: string): string[] {
  return run
    .split('\n')
    .map(l => l.replace(/^\s*#.*$/, '').trimEnd())
    .filter(l => l.trim() !== '')
}

// The builder stand-in. Its summary keys are the ones
// scripts/build-global-totals.ts writes to stdout.
const NPX_STUB = `#!/usr/bin/env bash
set -euo pipefail
[ "$1 $2" = "tsx scripts/build-global-totals.ts" ] || { echo "npx stub: unexpected $*" >&2; exit 2; }
shift 2
while [ $# -gt 0 ]; do
  case "$1" in
    --snapshot-dir) DIR="$2"; shift 2 ;;
    --date) DATE="$2"; shift 2 ;;
    *) echo "npx stub: unexpected flag $1" >&2; exit 2 ;;
  esac
done
if [ -n "\${STUB_BUILD_FAIL:-}" ] && [[ "\${DATE}" =~ \${STUB_BUILD_FAIL} ]]; then
  echo "::error::\${DATE}: 1 of 2 listed district(s) supplied no file" >&2
  exit 1
fi
echo '{"date":"'"\${DATE}"'"}' > "\${DIR}/global-totals.json"
echo '{"date":"'"\${DATE}"'","programYear":"2025-2026","path":"'"\${DIR}"'/global-totals.json","districts":2,"clubs":40,"payments":800,"membership":790,"excludedDistricts":0,"duplicateClubs":0}'
`

let tmp: string
let root: string
let summary: string

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'backfill-gate-'))
  root = path.join(tmp, 'gcs')
  summary = path.join(tmp, 'summary.md')
  fs.mkdirSync(path.join(root, STAGING), { recursive: true })
  fs.mkdirSync(path.join(root, PRODUCTION), { recursive: true })
  // The step runs from the checkout root: `scripts/` resolves there, and its
  // ./cache lands in the temp directory instead of the repo.
  const work = path.join(tmp, 'work')
  fs.mkdirSync(work)
  fs.symlinkSync(path.join(REPO, 'scripts'), path.join(work, 'scripts'))
  const bin = path.join(tmp, 'bin')
  fs.mkdirSync(bin)
  fs.symlinkSync(SHIM, path.join(bin, 'gcloud'))
  fs.writeFileSync(path.join(bin, 'npx'), NPX_STUB, { mode: 0o755 })
})

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

function putProd(objectPath: string): void {
  const obj = path.join(root, PRODUCTION, objectPath)
  fs.mkdirSync(path.dirname(obj), { recursive: true })
  fs.writeFileSync(obj, '{}')
}

/** A date the archive holds: its district set and one district file. */
function archived(date: string): void {
  putProd(`snapshots/${date}/all-districts-rankings.json`)
  putProd(`snapshots/${date}/district_61.json`)
}

function stagedRollup(date: string): boolean {
  return fs.existsSync(
    path.join(root, STAGING, `snapshots/${date}/global-totals.json`)
  )
}

/**
 * Run the step as GitHub does (`bash -e`), with its `${{ }}` expressions
 * resolved the way the runner would for the given inputs.
 */
function runStep(
  dates: string[],
  inputs: { allow_partial?: string } = {},
  env: Record<string, string> = {}
) {
  const allowPartial = inputs.allow_partial ?? 'false'
  const script = (backfill?.run ?? '').replaceAll(
    '${{ inputs.dates }}',
    dates.join(',')
  )
  expect(script).not.toMatch(/\$\{\{/)
  const stepEnv = Object.fromEntries(
    Object.entries(backfill?.env ?? {}).map(([k, v]) => [
      k,
      v.replaceAll('${{ inputs.allow_partial }}', allowPartial),
    ])
  )
  const r = spawnSync('bash', ['-e', '-c', script], {
    cwd: path.join(tmp, 'work'),
    encoding: 'utf-8',
    env: {
      PATH: `${path.join(tmp, 'bin')}:${process.env.PATH ?? ''}`,
      HOME: tmp,
      SHIM_ROOT: root,
      GCS_BUCKET: STAGING,
      GCS_BUCKET_PRODUCTION: PRODUCTION,
      RUN_MANIFEST_FILE: path.join(tmp, 'run', 'written.jsonl'),
      GITHUB_STEP_SUMMARY: summary,
      ...stepEnv,
      ...env,
    },
  })
  const md = fs.existsSync(summary) ? fs.readFileSync(summary, 'utf-8') : ''
  return { status: r.status, out: r.stdout + r.stderr, md }
}

describe('data-pipeline.yml backfill-global-totals: the partial-failure gate (#1771, D-26)', () => {
  it('finds the backfill step (non-vacuous)', () => {
    expect(backfill?.run).toBeTruthy()
  })

  it('wires ALLOW_PARTIAL to inputs.allow_partial on the step', () => {
    expect(backfill?.env?.ALLOW_PARTIAL).toBe('${{ inputs.allow_partial }}')
  })

  it('makes the gate the last command, fed the loop FAILED count', () => {
    const lines = codeLines(backfill?.run ?? '')
    expect(lines.at(-1)?.trim()).toBe(
      'bash scripts/partial-failure-gate.sh "backfill-global-totals" "${FAILED}"'
    )
  })

  it('passes a run where every date built', () => {
    archived('2026-03-31')
    archived('2026-06-30')
    const r = runStep(['2026-03-31', '2026-06-30'])
    expect(r.status, r.out).toBe(0)
    expect(stagedRollup('2026-03-31')).toBe(true)
    expect(stagedRollup('2026-06-30')).toBe(true)
  })

  it('fails the run on one date the builder refused, allow_partial=false', () => {
    archived('2026-03-31')
    archived('2026-06-30')
    const r = runStep(
      ['2026-03-31', '2026-06-30'],
      {},
      {
        STUB_BUILD_FAIL: '^2026-06-30$',
      }
    )
    expect(r.status, r.out).toBe(1)
    expect(r.out).toMatch(
      /::error::1 dates failed during backfill-global-totals/
    )
    expect(r.md).toMatch(/1 failed dates — run failed, not promoted/)
    // Per-date uploads are intended: the good date stands in staging.
    expect(stagedRollup('2026-03-31')).toBe(true)
    expect(stagedRollup('2026-06-30')).toBe(false)
  })

  it('fails the run on a date the archive does not hold, allow_partial=false', () => {
    archived('2026-03-31')
    const r = runStep(['2026-03-31', '2025-03-31'])
    expect(r.status, r.out).toBe(1)
    expect(r.out).toMatch(/partial|allow_partial/)
    expect(stagedRollup('2026-03-31')).toBe(true)
  })

  it('lets the run go on with a failed date when allow_partial=true', () => {
    archived('2026-03-31')
    archived('2026-06-30')
    const r = runStep(
      ['2026-03-31', '2026-06-30'],
      { allow_partial: 'true' },
      { STUB_BUILD_FAIL: '^2026-06-30$' }
    )
    expect(r.status, r.out).toBe(0)
    expect(r.out).toMatch(/::warning::1 dates failed .*allow_partial=true/)
    expect(r.md).toMatch(/1 failed dates allowed/)
  })

  it('still fails a run where no date built, even with allow_partial=true', () => {
    archived('2026-06-30')
    const r = runStep(
      ['2026-06-30'],
      { allow_partial: 'true' },
      { STUB_BUILD_FAIL: '.' }
    )
    expect(r.status, r.out).toBe(1)
    expect(r.out).toMatch(/::error::No dates were backfilled/)
  })
})
