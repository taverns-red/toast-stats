/**
 * CLI contract for scripts/plan-data-restore.ts (#2539): exit codes, the
 * stdout/stderr split (R4) and argument refusals. Plan mode makes no GCS call;
 * execute mode is only exercised on inputs that refuse before any gcloud call,
 * and GCLOUD points at a path that cannot run, so nothing can reach GCS.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

const REPO = process.cwd()
const TSX = path.join(REPO, 'node_modules/.bin/tsx')
const CLI = path.join(REPO, 'scripts/plan-data-restore.ts')
const BUCKET = 'toast-stats-data-ca'

const obj = (
  name: string,
  generation: string,
  timeCreated: string,
  softDeleteTime?: string
) => ({
  url: `gs://${BUCKET}/${name}#${generation}`,
  type: 'cloud_object',
  metadata: {
    bucket: BUCKET,
    name,
    generation,
    timeCreated,
    ...(softDeleteTime ? { softDeleteTime } : {}),
  },
})

const BAD = '2026-11-08T10:12:23Z'
let tmp: string
const file = (name: string, content: unknown): string => {
  const f = path.join(tmp, name)
  fs.writeFileSync(
    f,
    typeof content === 'string' ? content : JSON.stringify(content)
  )
  return f
}
const cli = (args: string[]) =>
  spawnSync(TSX, [CLI, ...args], {
    cwd: REPO,
    encoding: 'utf-8',
    env: { ...process.env, GCLOUD: '/nonexistent/gcloud' },
  })

let live: string
let soft: string
let paths: string
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-data-restore-cli-'))
  live = file('live.json', [obj('v1/latest.json', '300', BAD)])
  soft = file('soft.json', [
    obj('v1/latest.json', '200', '2026-11-07T10:00:00Z', BAD),
  ])
  paths = file('paths.txt', 'v1/latest.json\n')
})
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

const planArgs = () => [
  '--live',
  live,
  '--soft-deleted',
  soft,
  '--since',
  '2026-11-08T10:00:00Z',
  '--until',
  '2026-11-08T11:00:00Z',
  '--paths',
  paths,
]

describe('plan-data-restore CLI', () => {
  it('prints the plan on stdout, logs on stderr, exits 0', () => {
    const r = cli(planArgs())
    expect(r.status).toBe(0)
    const out = JSON.parse(r.stdout)
    expect(out.entries[0]).toMatchObject({
      action: 'restore',
      generation: '200',
    })
    expect(out.until).toBe('2026-11-08T11:00:00Z')
    expect(r.stderr).toMatch(/plan:/)
  })

  it('exits 1 with the plan on stdout when an object is refused', () => {
    live = file('live2.json', [
      obj('v1/latest.json', '300', '2026-11-08T10:30:00Z'),
    ])
    const r = cli(planArgs())
    expect(r.status).toBe(1)
    expect(JSON.parse(r.stdout).refused).toBe(1)
    expect(r.stderr).toMatch(/refused/)
  })

  it('exits 2 when --paths is missing', () => {
    const args = planArgs()
    args.splice(args.indexOf('--paths'), 2)
    const r = cli(args)
    expect(r.status).toBe(2)
    expect(r.stdout).toBe('')
    expect(r.stderr).toMatch(/usage/)
  })

  it('exits 2 when --until is missing', () => {
    const args = planArgs()
    args.splice(args.indexOf('--until'), 2)
    const r = cli(args)
    expect(r.status).toBe(2)
    expect(r.stdout).toBe('')
  })

  it('exits 1 with nothing on stdout for a --since without an offset', () => {
    const args = planArgs()
    args[args.indexOf('--since') + 1] = '2026-11-08T10:00:00'
    const r = cli(args)
    expect(r.status).toBe(1)
    expect(r.stdout).toBe('')
    expect(r.stderr).toMatch(/offset|timezone|Z/i)
  })

  it('exits 2 for --execute without --plan', () => {
    const r = cli(['--execute', '--live', live, '--soft-deleted', soft])
    expect(r.status).toBe(2)
    expect(r.stdout).toBe('')
    expect(r.stderr).toMatch(/usage/)
  })

  it('refuses a malformed saved plan before running anything', () => {
    const bad = file('plan.json', { version: 1, entries: 'nope' })
    const r = cli([
      '--execute',
      '--plan',
      bad,
      '--live',
      live,
      '--soft-deleted',
      soft,
    ])
    expect(r.status).toBe(1)
    expect(r.stdout).toBe('')
    expect(r.stderr).toMatch(/refused/)
  })

  it('refuses a saved plan that no longer matches the listing', () => {
    const planned = cli(planArgs())
    const saved = file('plan2.json', planned.stdout)
    live = file('live3.json', [
      obj('v1/latest.json', '400', '2026-11-08T10:40:00Z'),
    ])
    const r = cli([
      '--execute',
      '--plan',
      saved,
      '--live',
      live,
      '--soft-deleted',
      soft,
    ])
    expect(r.status).toBe(1)
    expect(r.stdout).toBe('')
    expect(r.stderr).toMatch(/does not match/)
  })
})
