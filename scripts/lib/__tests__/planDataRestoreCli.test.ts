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
    env: {
      ...process.env,
      GCLOUD: '/nonexistent/gcloud',
      // Two days after the bad run: inside the soft-delete retention window.
      PLAN_RESTORE_NOW: '2026-11-10T00:00:00Z',
    },
  })

let live: string
let soft: string
let paths: string
let liveErr: string
let softErr: string
const NONE = 'ERROR: (gcloud.storage.ls) One or more URLs matched no objects.\n'
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-data-restore-cli-'))
  live = file('live.json', [obj('v1/latest.json', '300', BAD)])
  soft = file('soft.json', [
    obj('v1/latest.json', '200', '2026-11-07T10:00:00Z', BAD),
  ])
  paths = file('paths.txt', 'v1/latest.json\n')
  liveErr = file('live.err', '')
  softErr = file('soft.err', NONE)
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
  '--live-errors',
  liveErr,
  '--soft-errors',
  softErr,
]

const without = (args: string[], flag: string): string[] => {
  const a = [...args]
  a.splice(a.indexOf(flag), 2)
  return a
}

describe('plan-data-restore CLI: --removals (#2856)', () => {
  const RECORD =
    '{"path":"snapshots/2026-10-10/district_U.json","kind":"gap","date":"2026-10-10"}\n'

  it('lists a recorded removal as excluded, and never as a restore', () => {
    const r = cli([...planArgs(), '--removals', file('r.jsonl', RECORD)])
    expect(r.status, r.stderr).toBe(0)
    const plan = JSON.parse(r.stdout) as {
      entries: Array<{ name: string; action: string }>
    }
    expect(plan.entries.find(e => e.action === 'excluded')?.name).toBe(
      'snapshots/2026-10-10/district_U.json'
    )
  })

  it('plans without the flag: a run that removed nothing has no record', () => {
    const r = cli(planArgs())
    expect(r.status, r.stderr).toBe(0)
    expect(r.stdout).not.toContain('excluded')
  })

  it('refuses a record that is not valid rather than reading it as empty', () => {
    const r = cli([...planArgs(), '--removals', file('bad.jsonl', 'oops\n')])
    expect(r.status).toBe(1)
    expect(r.stdout).toBe('')
    expect(r.stderr).toMatch(/removal record/)
  })

  it('refuses a record file that cannot be read', () => {
    const r = cli([...planArgs(), '--removals', path.join(tmp, 'absent.jsonl')])
    expect(r.status).toBe(1)
  })
})

describe('plan-data-restore CLI: gcloud listings of many URLs (#3258)', () => {
  // gcloud prints one JSON array per URL, back to back (see
  // fixtures/gcloud-ls-json/two-urls.txt).
  const arrays = (...lists: unknown[][]): string =>
    lists.map(l => JSON.stringify(l, null, 2)).join('\n') + '\n'

  it('plans from listings that hold one array per URL', () => {
    live = file(
      'live-many.json',
      arrays(
        [obj('v1/latest.json', '300', BAD)],
        [obj('v1/other.json', '5', BAD)]
      )
    )
    soft = file(
      'soft-many.json',
      arrays([obj('v1/latest.json', '200', '2026-11-07T10:00:00Z', BAD)], [])
    )
    const r = cli(planArgs())
    expect(r.status, r.stderr).toBe(0)
    expect(JSON.parse(r.stdout).entries[0]).toMatchObject({
      action: 'restore',
      generation: '200',
    })
  })

  it('reads an empty soft listing as no copies, and refuses on that', () => {
    soft = file('soft-empty.json', '')
    const r = cli(planArgs())
    expect(r.status, r.stderr).toBe(1)
    expect(r.stderr).not.toMatch(/JSON/)
    expect(JSON.parse(r.stdout).entries[0].reason).toMatch(
      /soft-deleted listing is empty/
    )
  })

  it('reads the same listings in --execute mode', () => {
    live = file(
      'live-many-x.json',
      arrays([obj('v1/latest.json', '300', BAD)], [])
    )
    const r = cli([
      '--execute',
      '--plan',
      file('p.json', {}),
      '--live',
      live,
      '--soft-deleted',
      soft,
      '--live-errors',
      liveErr,
      '--soft-errors',
      softErr,
    ])
    expect(r.status).toBe(1)
    expect(r.stderr).not.toMatch(/JSON/)
    expect(r.stderr).toMatch(/plan/i)
  })

  it('refuses a truncated listing', () => {
    live = file(
      'live-cut.json',
      arrays([obj('v1/latest.json', '300', BAD)]).slice(0, -4)
    )
    const r = cli(planArgs())
    expect(r.status).toBe(1)
    expect(r.stdout).toBe('')
  })
})

describe('plan-data-restore CLI', () => {
  it('plans when an errors file holds only "matched no objects" lines', () => {
    softErr = file('soft2.err', NONE + NONE)
    expect(cli(planArgs()).status).toBe(0)
  })

  it('refuses the whole plan for any other line in an errors file', () => {
    softErr = file(
      'soft3.err',
      NONE + 'ERROR: (gcloud.storage.ls) HTTPError 503: backend error\n'
    )
    const r = cli(planArgs())
    expect(r.status).toBe(1)
    expect(r.stdout).toBe('')
    expect(r.stderr).toMatch(/refused/)
    expect(r.stderr).toMatch(/503/)
  })

  it('exits 2 when an errors file argument is missing', () => {
    for (const flag of ['--live-errors', '--soft-errors']) {
      const r = cli(without(planArgs(), flag))
      expect(r.status).toBe(2)
      expect(r.stdout).toBe('')
      expect(r.stderr).toMatch(/usage/)
    }
  })

  it('exits 2 for --execute without an errors file', () => {
    const r = cli([
      '--execute',
      '--plan',
      file('p.json', {}),
      '--live',
      live,
      '--soft-deleted',
      soft,
      '--live-errors',
      liveErr,
    ])
    expect(r.status).toBe(2)
  })

  it('refuses every restore once now is past since + 13 days', () => {
    const r = spawnSync(TSX, [CLI, ...planArgs()], {
      cwd: REPO,
      encoding: 'utf-8',
      env: {
        ...process.env,
        GCLOUD: '/nonexistent/gcloud',
        PLAN_RESTORE_NOW: '2026-11-22T00:00:00Z',
      },
    })
    expect(r.status).toBe(1)
    const entry = JSON.parse(r.stdout).entries[0]
    expect(entry.action).toBe('refuse')
    expect(entry.reason).toMatch(/soft.delete retention/i)
  })

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
    const r = cli([
      '--execute',
      '--live',
      live,
      '--soft-deleted',
      soft,
      '--live-errors',
      liveErr,
      '--soft-errors',
      softErr,
    ])
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
      '--live-errors',
      liveErr,
      '--soft-errors',
      softErr,
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
      '--live-errors',
      liveErr,
      '--soft-errors',
      softErr,
    ])
    expect(r.status).toBe(1)
    expect(r.stdout).toBe('')
    expect(r.stderr).toMatch(/does not match/)
  })
})
