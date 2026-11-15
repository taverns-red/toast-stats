/**
 * CLI contract for scripts/data-auto-restore.ts (#2537): the subcommands the
 * data-auto-restore job calls, run on fixtures. No GCS call is possible: the
 * CLI only reads local files and writes $GITHUB_OUTPUT and a body file.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

const REPO = process.cwd()
const TSX = path.join(REPO, 'node_modules/.bin/tsx')
const CLI = path.join(REPO, 'scripts/data-auto-restore.ts')

let tmp: string
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'data-auto-restore-'))
})
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

const file = (name: string, content: unknown): string => {
  const f = path.join(tmp, name)
  fs.writeFileSync(
    f,
    typeof content === 'string' ? content : JSON.stringify(content)
  )
  return f
}
const run = (args: string[], env: Record<string, string> = {}) => {
  const out = path.join(tmp, 'gh-output')
  const r = spawnSync(TSX, [CLI, ...args], {
    cwd: REPO,
    encoding: 'utf-8',
    env: {
      ...process.env,
      DATA_AUTO_RESTORE: '',
      GITHUB_OUTPUT: out,
      RUNNER_TEMP: tmp,
      ...env,
    },
  })
  const outputs: Record<string, string> = {}
  if (fs.existsSync(out)) {
    for (const line of fs.readFileSync(out, 'utf-8').split('\n')) {
      const i = line.indexOf('=')
      if (i > 0) outputs[line.slice(0, i)] = line.slice(i + 1)
    }
  }
  return { ...r, outputs }
}

const entry = (name: string, action: string, extra = {}) => ({
  name,
  action,
  liveGeneration: '200',
  reason: `${action} because`,
  ...(action === 'restore' ? { generation: '100' } : {}),
  ...extra,
})
const planOf = (entries: ReturnType<typeof entry>[]) => ({
  version: 1,
  bucket: 'toast-stats-data-ca',
  since: '2026-11-14T10:00:00Z',
  until: '2026-11-14T10:40:00Z',
  entries,
  refused: entries.filter(e => e.action === 'refuse').length,
})

describe('mode', () => {
  it('unset is dry-run', () => {
    const r = run(['mode'])
    expect(r.status).toBe(0)
    expect(r.outputs['mode']).toBe('dry-run')
  })

  it('execute only on the exact word', () => {
    expect(
      run(['mode'], { DATA_AUTO_RESTORE: 'execute' }).outputs['mode']
    ).toBe('execute')
    expect(run(['mode'], { DATA_AUTO_RESTORE: 'true' }).outputs['mode']).toBe(
      'dry-run'
    )
    expect(run(['mode'], { DATA_AUTO_RESTORE: 'off' }).outputs['mode']).toBe(
      'off'
    )
  })
})

describe('paths', () => {
  it('writes the promoted-prefix paths from the run manifest', () => {
    const manifest = file(
      'written.jsonl',
      [
        { path: 'v1/latest.json' },
        { path: 'raw-csv/2026-11-14/a.csv' },
        { path: 'snapshots/2026-11-14/metadata.json' },
      ]
        .map(o => JSON.stringify(o))
        .join('\n') + '\n'
    )
    const out = path.join(tmp, 'paths.txt')
    const r = run(['paths', '--manifest', manifest, '--out', out])
    expect(r.status).toBe(0)
    expect(fs.readFileSync(out, 'utf-8')).toBe(
      'snapshots/2026-11-14/metadata.json\nv1/latest.json\n'
    )
  })

  it('exits 1 on an empty selection: nothing limits the deletes', () => {
    const manifest = file('written.jsonl', '{"path":"raw-csv/a.csv"}\n')
    const r = run([
      'paths',
      '--manifest',
      manifest,
      '--out',
      path.join(tmp, 'p'),
    ])
    expect(r.status).toBe(1)
  })
})

describe('decide', () => {
  it('a refused plan in execute mode: no execute, issue filed', () => {
    const plan = file(
      'plan.json',
      planOf([
        entry('v1/dates.json', 'refuse'),
        entry('v1/latest.json', 'restore'),
      ])
    )
    const r = run(['decide', '--plan', plan], {
      DATA_AUTO_RESTORE: 'execute',
      UNHEALTHY: 'true',
    })
    expect(r.status).toBe(0)
    expect(r.outputs['execute']).toBe('false')
    expect(r.outputs['file_issue']).toBe('true')
    expect(r.outputs['action']).toBe('refused')
  })

  it('a missing plan file (the planner crashed) never executes', () => {
    const r = run(['decide', '--plan', path.join(tmp, 'absent.json')], {
      DATA_AUTO_RESTORE: 'execute',
      UNHEALTHY: 'true',
    })
    expect(r.outputs['execute']).toBe('false')
    expect(r.outputs['action']).toBe('plan-failed')
    expect(r.outputs['file_issue']).toBe('true')
  })

  it('an unreadable plan file never executes', () => {
    const plan = file('plan.json', '{"version":1')
    const r = run(['decide', '--plan', plan], {
      DATA_AUTO_RESTORE: 'execute',
      UNHEALTHY: 'true',
    })
    expect(r.outputs['execute']).toBe('false')
    expect(r.outputs['action']).toBe('plan-failed')
  })

  it('a clean plan executes only in execute mode', () => {
    const plan = file('plan.json', planOf([entry('v1/latest.json', 'restore')]))
    const dry = run(['decide', '--plan', plan], { UNHEALTHY: 'true' })
    expect(dry.outputs['execute']).toBe('false')
    expect(dry.outputs['action']).toBe('plan-only')
    const live = run(['decide', '--plan', plan], {
      DATA_AUTO_RESTORE: 'execute',
      UNHEALTHY: 'true',
      RESTORE_ELIGIBLE: 'true',
    })
    expect(live.outputs['execute']).toBe('true')
  })

  it('execute mode with a verdict that is not eligible never executes', () => {
    const plan = file('plan.json', planOf([entry('v1/latest.json', 'restore')]))
    for (const eligible of ['', 'false', 'TRUE']) {
      const r = run(['decide', '--plan', plan], {
        DATA_AUTO_RESTORE: 'execute',
        UNHEALTHY: 'true',
        RESTORE_ELIGIBLE: eligible,
        RESTORE_REASON: 'only a freshness failure',
      })
      expect(r.outputs['execute'], eligible).toBe('false')
      expect(r.outputs['action'], eligible).toBe('not-eligible')
      expect(r.outputs['file_issue'], eligible).toBe('true')
    }
  })

  it('healthy data decides nothing and files nothing', () => {
    const plan = file('plan.json', planOf([entry('v1/latest.json', 'restore')]))
    const r = run(['decide', '--plan', plan], {
      DATA_AUTO_RESTORE: 'execute',
      UNHEALTHY: 'false',
    })
    expect(r.outputs['execute']).toBe('false')
    expect(r.outputs['file_issue']).toBe('false')
  })
})

describe('verdict', () => {
  it('writes restore_eligible true for a cdn-data decode failure', () => {
    const result = file('smoke.json', {
      healthy: false,
      failures: ['cdn-data: latest.json is not JSON'],
    })
    const r = run(['verdict'], {
      SMOKE_HEALTHY: 'false',
      SMOKE_RESULT_FILE: result,
      SCHEMA_UNHEALTHY: 'false',
    })
    expect(r.status).toBe(0)
    expect(r.outputs['restore_eligible']).toBe('true')
  })

  it('writes false with a reason for a Hosting probe failure', () => {
    const result = file('smoke.json', {
      healthy: false,
      failures: ['home: HTTP 500'],
    })
    const r = run(['verdict'], {
      SMOKE_HEALTHY: 'false',
      SMOKE_RESULT_FILE: result,
      SCHEMA_UNHEALTHY: 'false',
    })
    expect(r.outputs['restore_eligible']).toBe('false')
    expect(r.outputs['restore_reason']).toContain('home')
  })

  it('a missing or unreadable result file is not eligible', () => {
    for (const f of [path.join(tmp, 'absent.json'), file('bad.json', '{')]) {
      const r = run(['verdict'], {
        SMOKE_HEALTHY: 'false',
        SMOKE_RESULT_FILE: f,
        SCHEMA_UNHEALTHY: 'true',
        SCHEMA_RESTORE_ELIGIBLE: 'true',
      })
      expect(r.outputs['restore_eligible']).toBe('false')
    }
  })

  it('a schema failure flagged eligible by the canary is eligible', () => {
    const r = run(['verdict'], {
      SMOKE_HEALTHY: 'true',
      SCHEMA_UNHEALTHY: 'true',
      SCHEMA_RESTORE_ELIGIBLE: 'true',
    })
    expect(r.outputs['restore_eligible']).toBe('true')
  })
})

describe('report', () => {
  it('the issue body contains the plan, refusals included', () => {
    const plan = file(
      'plan.json',
      planOf([
        entry('v1/dates.json', 'refuse', {
          reason: 'no chain to the live copy',
        }),
        entry('v1/latest.json', 'restore'),
        entry('snapshots/2026-11-14/metadata.json', 'delete'),
      ])
    )
    const r = run(['report', '--plan', plan], {
      DATA_AUTO_RESTORE: 'execute',
      UNHEALTHY: 'true',
      RUN_URL: 'https://github.com/taverns-red/toast-stats/actions/runs/9',
      FAILED: 'the schema check',
    })
    expect(r.status).toBe(0)
    const bodyFile = r.outputs['body_file']!
    expect(bodyFile).toBeTruthy()
    const body = fs.readFileSync(bodyFile, 'utf-8')
    expect(body).toContain('v1/dates.json')
    expect(body).toContain('no chain to the live copy')
    expect(body).toContain('snapshots/2026-11-14/metadata.json')
    expect(body).toContain('actions/runs/9')
    // a refusal aborts the execute, and the issue says so
    expect(body).toMatch(/refus/i)
    expect(r.outputs['title']).toBeTruthy()
  })

  it('still writes a body when there is no plan', () => {
    const r = run(['report', '--plan', path.join(tmp, 'absent.json')], {
      UNHEALTHY: 'true',
      RUN_URL: 'https://example.invalid/run',
    })
    expect(r.status).toBe(0)
    const body = fs.readFileSync(r.outputs['body_file']!, 'utf-8')
    expect(body).toContain('docs/runbooks/data-restore.md')
  })
})
