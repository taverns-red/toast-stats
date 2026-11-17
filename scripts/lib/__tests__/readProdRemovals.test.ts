/**
 * scripts/pipeline/read-prod-removals.sh against the gcloud shim (#2856).
 *
 * The restore plan reads the run's prod removal record from staging. An
 * absent record is an empty one (a run that removed nothing publishes none);
 * a record that exists but cannot be read stops the plan, since reading it as
 * empty would make a deliberate removal look unexplained and restorable.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

const REPO = process.cwd()
const SCRIPT = path.join(REPO, 'scripts/pipeline/read-prod-removals.sh')
const SHIM = path.join(
  REPO,
  'scripts/lib/__tests__/fixtures/gcloud-shim/gcloud'
)
const STG = 'stg-bucket'
const RUN = '4242'

let tmp: string
let root: string
let out: string

const put = (name: string, body: string) => {
  const f = path.join(root, STG, 'runs', RUN, name)
  fs.mkdirSync(path.dirname(f), { recursive: true })
  fs.writeFileSync(f, body)
}

const read = (env: Record<string, string> = {}) =>
  spawnSync('bash', [SCRIPT, STG, RUN, out], {
    encoding: 'utf-8',
    env: { ...process.env, GCLOUD: SHIM, SHIM_ROOT: root, ...env },
  })

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'read-prod-removals-'))
  root = path.join(tmp, 'gcs')
  fs.mkdirSync(path.join(root, STG), { recursive: true })
  out = path.join(tmp, 'out', 'removed.jsonl')
})
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe('read-prod-removals.sh', () => {
  it('writes an empty file when the run recorded nothing', () => {
    const r = read()
    expect(r.status, r.stderr).toBe(0)
    expect(fs.readFileSync(out, 'utf-8')).toBe('')
  })

  it('reads the pipeline job’s record', () => {
    put(
      'prod-removed.jsonl',
      '{"path":"snapshots/2026-09-15/","kind":"prune"}\n'
    )
    const r = read()
    expect(r.status, r.stderr).toBe(0)
    expect(fs.readFileSync(out, 'utf-8')).toBe(
      '{"path":"snapshots/2026-09-15/","kind":"prune"}\n'
    )
  })

  it('joins the pipeline job’s and the promote-reports job’s records', () => {
    put('prod-removed.jsonl', '{"path":"a/","kind":"prune"}')
    put('prod-removed-reports.jsonl', '{"path":"b.json","kind":"gap"}\n')
    const r = read()
    expect(r.status, r.stderr).toBe(0)
    expect(fs.readFileSync(out, 'utf-8')).toBe(
      '{"path":"a/","kind":"prune"}\n{"path":"b.json","kind":"gap"}\n'
    )
  })

  it('merges the records of every attempt of the run (#2903)', () => {
    put('prod-removed-a1.jsonl', '{"path":"a/","kind":"prune"}\n')
    put('prod-removed-a2.jsonl', '{"path":"b.json","kind":"gap"}\n')
    put('prod-removed-reports-a1.jsonl', '{"path":"c.json","kind":"gap"}\n')
    put('prod-removed-reports-a2.jsonl', '{"path":"d.json","kind":"gap"}')
    const r = read()
    expect(r.status, r.stderr).toBe(0)
    expect(fs.readFileSync(out, 'utf-8')).toBe(
      '{"path":"a/","kind":"prune"}\n{"path":"b.json","kind":"gap"}\n' +
        '{"path":"c.json","kind":"gap"}\n{"path":"d.json","kind":"gap"}\n'
    )
  })

  it('stops when an attempt’s record exists but cannot be read (#2903)', () => {
    put('prod-removed-a1.jsonl', '{"path":"a/","kind":"prune"}\n')
    put('prod-removed-a2.jsonl', '{"path":"b/","kind":"prune"}\n')
    const r = read({ SHIM_FAIL_MATCH: '^cat .*prod-removed-a2' })
    expect(r.status).toBe(1)
    expect(fs.existsSync(out)).toBe(false)
  })

  it('stops when the record listing itself fails (#2903)', () => {
    const r = read({ SHIM_FAIL_MATCH: '^ls ' })
    expect(r.status).toBe(1)
  })

  it('stops, and leaves no file, when a record exists but cannot be read', () => {
    put('prod-removed.jsonl', '{"path":"a/","kind":"prune"}\n')
    fs.mkdirSync(path.dirname(out), { recursive: true })
    fs.writeFileSync(out, 'stale')
    const r = read({ SHIM_FAIL_MATCH: '^cat .*prod-removed\\.jsonl' })
    expect(r.status).toBe(1)
    expect(fs.existsSync(out)).toBe(false)
  })

  it('treats a read outage on the reports record as unreadable too', () => {
    put('prod-removed-reports.jsonl', '{"path":"b.json","kind":"gap"}\n')
    const r = read({ SHIM_FAIL_MATCH: '^cat .*prod-removed-reports' })
    expect(r.status).toBe(1)
  })

  it('needs three arguments', () => {
    const r = spawnSync('bash', [SCRIPT, STG], { encoding: 'utf-8' })
    expect(r.status).toBe(2)
  })
})
