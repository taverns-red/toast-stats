/**
 * rebuild-analytics.ts logs to stderr, not stdout (#2913, rule R4).
 *
 * The script has no structured output, so stdout must stay empty and every
 * progress, summary and failure line goes to stderr. No workflow or script
 * reads its stdout (grep of .github/ and scripts/ for the script name finds
 * only comments and tests), so nothing downstream depends on the old stream.
 *
 * The script runs against a throwaway CACHE_DIR; it never touches GCS.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

const REPO = process.cwd()
const TSX = path.join(REPO, 'node_modules/.bin/tsx')
const CLI = path.join(REPO, 'scripts/rebuild-analytics.ts')

let tmp: string
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rebuild-analytics-'))
})
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

// Well under the suite's 10 s test timeout, so a hung child fails here with a
// clear message and not as a generic test timeout (#2944).
const CHILD_TIMEOUT_MS = 8_000

function run(dates: string[]) {
  // The script exits 1 when the snapshots folder is missing, so an empty list
  // still needs the folder; the date folders below then need no `recursive`.
  const snapshots = path.join(tmp, 'snapshots')
  fs.mkdirSync(snapshots)
  for (const d of dates) fs.mkdirSync(path.join(snapshots, d))
  const r = spawnSync(TSX, [CLI], {
    cwd: REPO,
    env: { ...process.env, CACHE_DIR: tmp },
    encoding: 'utf-8',
    timeout: CHILD_TIMEOUT_MS,
  })
  // spawnSync reports a timeout or a failed launch in `error`, not as a throw.
  expect(
    r.error,
    `rebuild-analytics did not finish in ${CHILD_TIMEOUT_MS} ms: ${String(r.error)}`
  ).toBeUndefined()
  return r
}

describe('rebuild-analytics output streams (#2913)', () => {
  it('reports "nothing to do" on stderr and leaves stdout empty', () => {
    const r = run([])
    expect(r.status).toBe(0)
    expect(r.stdout).toBe('')
    expect(r.stderr).toContain('Nothing to do.')
  })

  it('sends progress, per-date result and summary to stderr', () => {
    const r = run(['2026-01-01'])
    expect(r.status, r.stderr).toBe(0)
    expect(r.stdout).toBe('')
    expect(r.stderr).toContain('Computing analytics for 1 dates')
    expect(r.stderr).toContain('[1/1] 2026-01-01')
    expect(r.stderr).toContain('Analytics rebuild complete')
    expect(r.stderr).toContain('Next step')
  })
})
