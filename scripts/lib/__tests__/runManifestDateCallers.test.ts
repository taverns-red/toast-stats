/**
 * The two callers that take "the dates this run wrote" from the run
 * manifest (#2475 phase 3, review of PR #3070):
 *
 * - scripts/run-manifest-snapshot-dates.ts: the closing-pinned auto-allow
 *   list (#2040). It must vouch only for dates the daily itself wrote.
 * - scripts/date-completeness-gate.ts: the dates the completeness gate (and
 *   its Find-A-Club continuity check) judges.
 *
 * The daily that stamps last month's revision index `final` writes
 * snapshots/<monthEnd>/revisions/index.json for that month end, and
 * nothing else of it. Neither caller may treat that month end as written.
 * The gate runs with no bucket names, so it fails closed after logging its
 * dates and never reaches GCS.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

const REPO = process.cwd()
const TSX = path.join(REPO, 'node_modules/.bin/tsx')
const SHA = 'a'.repeat(64)
const line = (p: string, date: string | null) =>
  JSON.stringify({ path: p, sha256: SHA, date, stage: 'daily-upload' })

let tmp: string
let manifest: string

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'run-manifest-callers-'))
  manifest = path.join(tmp, 'written.jsonl')
  fs.writeFileSync(
    manifest,
    [
      line('snapshots/2026-11-05/district_61.json', '2026-11-05'),
      line('snapshots/2026-11-05/metadata.json', '2026-11-05'),
      line('snapshots/2026-10-31/revisions/index.json', '2026-10-31'),
      line('v1/latest.json', null),
    ].join('\n') + '\n'
  )
})

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

const run = (script: string, env: Record<string, string>) =>
  spawnSync(TSX, [path.join(REPO, script)], {
    cwd: REPO,
    encoding: 'utf-8',
    env: {
      ...process.env,
      GCS_BUCKET: '',
      GCS_BUCKET_PRODUCTION: '',
      GITHUB_OUTPUT: '',
      GITHUB_STEP_SUMMARY: '',
      ...env,
    },
  })

describe('a stamped revision index is not a date the daily wrote (#2475)', () => {
  it('closing-pinned auto-allow lists only the daily’s own date', () => {
    const r = run('scripts/run-manifest-snapshot-dates.ts', {
      RUN_MANIFEST_FILE: manifest,
    })
    expect(r.status, r.stderr).toBe(0)
    expect(r.stdout).toBe('2026-11-05\n')
  })

  it('the completeness gate judges only the daily’s own date', () => {
    const r = run('scripts/date-completeness-gate.ts', {
      RUN_MANIFEST_FILE: manifest,
      COMPLETENESS_GATE_FILE: path.join(tmp, 'gate.json'),
      FAC_WARNING_BODY_FILE: path.join(tmp, 'fac.md'),
    })
    expect(r.stderr).toMatch(
      /\[completeness-gate\] touched dates: 2026-11-05\n/
    )
  })
})
