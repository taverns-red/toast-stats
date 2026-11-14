/**
 * Auto-restore decision logic (#2537, epic #2492). Pure: what mode a repo
 * variable means, which manifest paths are in scope, whether a plan may be
 * executed, and what the data-rollback issue says. The plan itself comes from
 * plan-data-restore.ts (#2539); nothing here plans or touches GCS.
 */

import { describe, it, expect } from 'vitest'
import type { RestorePlan, PlanEntry } from '../dataRestorePlan.js'
import {
  DEFAULT_RESTORE_MODE,
  buildIssueBody,
  buildIssueTitle,
  decideRestore,
  manifestPaths,
  resolveRestoreMode,
} from '../dataAutoRestore.js'

const entry = (
  name: string,
  action: PlanEntry['action'],
  extra: Partial<PlanEntry> = {}
): PlanEntry => ({
  name,
  action,
  liveGeneration: '200',
  reason: `${action} because`,
  ...(action === 'restore' ? { generation: '100' } : {}),
  ...extra,
})

const planOf = (entries: PlanEntry[]): RestorePlan => ({
  version: 1,
  bucket: 'toast-stats-data-ca',
  since: '2026-11-14T10:00:00Z',
  until: '2026-11-14T10:40:00Z',
  entries,
  refused: entries.filter(e => e.action === 'refuse').length,
})

const clean = planOf([
  entry('v1/latest.json', 'restore'),
  entry('snapshots/2026-11-14/metadata.json', 'delete'),
  entry('config/untouched.json', 'noop'),
])
const refused = planOf([
  entry('v1/latest.json', 'restore'),
  entry('v1/dates.json', 'refuse', {
    reason: 'soft-deleted copy does not chain to the live generation',
  }),
])

describe('resolveRestoreMode', () => {
  it('defaults to dry-run, never execute', () => {
    expect(DEFAULT_RESTORE_MODE).toBe('dry-run')
    expect(DEFAULT_RESTORE_MODE).not.toBe('execute')
    expect(resolveRestoreMode(undefined)).toBe('dry-run')
    expect(resolveRestoreMode('')).toBe('dry-run')
  })

  it('treats anything unrecognised as dry-run (a typo never executes)', () => {
    for (const raw of ['true', 'on', '1', 'exec', 'EXECUTE!', 'yes']) {
      expect(resolveRestoreMode(raw), raw).toBe('dry-run')
    }
  })

  it('executes only on the exact word, ignoring case and spaces', () => {
    expect(resolveRestoreMode('execute')).toBe('execute')
    expect(resolveRestoreMode(' Execute ')).toBe('execute')
  })

  it('honours off', () => {
    expect(resolveRestoreMode('off')).toBe('off')
    expect(resolveRestoreMode('dry-run')).toBe('dry-run')
  })
})

describe('manifestPaths', () => {
  const jsonl = [
    { path: 'v1/latest.json' },
    { path: 'snapshots/2026-11-14/district_61.json' },
    { path: 'time-series/x.json' },
    { path: 'config/y.json' },
    { path: 'derived/education-rollup/z.json' },
    { path: 'og/v1/district/61.png' },
    { path: 'raw-csv/2026-11-14/a.csv' },
    { path: 'club-trends/a.json' },
    { path: 'v1/latest.json' },
  ]
    .map(o => JSON.stringify(o))
    .join('\n')

  it('keeps only the promoted prefixes, sorted and unique', () => {
    expect(manifestPaths(jsonl + '\n')).toEqual([
      'config/y.json',
      'derived/education-rollup/z.json',
      'snapshots/2026-11-14/district_61.json',
      'time-series/x.json',
      'v1/latest.json',
    ])
  })

  it('leaves out share cards: they are written after the window closes', () => {
    expect(manifestPaths(jsonl)).not.toContain('og/v1/district/61.png')
  })

  it('refuses a line it cannot read rather than skipping it', () => {
    expect(() => manifestPaths('{"path":"v1/a.json"}\nnot json\n')).toThrow(
      /line 2/
    )
  })
})

describe('decideRestore', () => {
  it('does nothing when the data is healthy', () => {
    for (const mode of ['off', 'dry-run', 'execute'] as const) {
      const d = decideRestore({ unhealthy: false, mode, plan: clean })
      expect(d).toMatchObject({
        action: 'skip',
        execute: false,
        fileIssue: false,
      })
    }
  })

  it('plans only in dry-run, and files the issue', () => {
    expect(
      decideRestore({ unhealthy: true, mode: 'dry-run', plan: clean })
    ).toMatchObject({ action: 'plan-only', execute: false, fileIssue: true })
  })

  it('executes a clean plan only in execute mode', () => {
    expect(
      decideRestore({ unhealthy: true, mode: 'execute', plan: clean })
    ).toMatchObject({ action: 'execute', execute: true, fileIssue: true })
  })

  it('a refused entry aborts the whole execute and still files the issue', () => {
    expect(
      decideRestore({ unhealthy: true, mode: 'execute', plan: refused })
    ).toMatchObject({ action: 'refused', execute: false, fileIssue: true })
  })

  it('a plan that failed to build never executes and files the issue', () => {
    expect(
      decideRestore({ unhealthy: true, mode: 'execute', plan: null })
    ).toMatchObject({ action: 'plan-failed', execute: false, fileIssue: true })
  })

  it('a plan with nothing to restore or delete does not execute', () => {
    const idle = planOf([entry('v1/latest.json', 'noop')])
    expect(
      decideRestore({ unhealthy: true, mode: 'execute', plan: idle })
    ).toMatchObject({
      action: 'nothing-to-do',
      execute: false,
      fileIssue: true,
    })
  })

  it('off files the issue without a plan and never executes', () => {
    expect(
      decideRestore({ unhealthy: true, mode: 'off', plan: null })
    ).toMatchObject({ action: 'off', execute: false, fileIssue: true })
  })
})

describe('issue text', () => {
  const ctx = {
    mode: 'dry-run' as const,
    runUrl: 'https://github.com/taverns-red/toast-stats/actions/runs/1',
    failed: 'the schema check',
  }

  it('titles name the outcome', () => {
    expect(buildIssueTitle('plan-only')).toMatch(/data-rollback|restore/i)
    expect(buildIssueTitle('execute')).not.toBe(buildIssueTitle('plan-only'))
  })

  it('carries the plan: window, counts and every refused entry with its reason', () => {
    const body = buildIssueBody({
      ...ctx,
      decision: decideRestore({
        unhealthy: true,
        mode: 'dry-run',
        plan: refused,
      }),
      plan: refused,
    })
    expect(body).toContain(ctx.runUrl)
    expect(body).toContain('2026-11-14T10:00:00Z')
    expect(body).toContain('2026-11-14T10:40:00Z')
    expect(body).toContain('v1/dates.json')
    expect(body).toContain(
      'soft-deleted copy does not chain to the live generation'
    )
    expect(body).toContain('v1/latest.json')
    expect(body).toMatch(/dry-run/)
    expect(body).toContain('the schema check')
  })

  it('escapes backslashes and pipes in a reason so a table row cannot break', () => {
    const p = planOf([entry('v1/a.json', 'refuse', { reason: 'a\\|b | c' })])
    const body = buildIssueBody({
      ...ctx,
      decision: decideRestore({ unhealthy: true, mode: 'dry-run', plan: p }),
      plan: p,
    })
    expect(body).toContain('a\\\\\\|b \\| c')
  })

  it('lists restores with the generation to restore and deletes by name', () => {
    const body = buildIssueBody({
      ...ctx,
      decision: decideRestore({
        unhealthy: true,
        mode: 'dry-run',
        plan: clean,
      }),
      plan: clean,
    })
    expect(body).toContain('v1/latest.json')
    expect(body).toContain('100')
    expect(body).toContain('snapshots/2026-11-14/metadata.json')
  })

  it('stays under the GitHub issue limit for a full daily manifest', () => {
    const many = planOf(
      Array.from({ length: 1600 }, (_, i) =>
        entry(
          `snapshots/2026-11-14/analytics/district_${i}_some_long_name.json`,
          'restore'
        )
      ).concat([entry('v1/dates.json', 'refuse')])
    )
    const body = buildIssueBody({
      ...ctx,
      decision: decideRestore({
        unhealthy: true,
        mode: 'dry-run',
        plan: many,
      }),
      plan: many,
    })
    expect(body.length).toBeLessThan(60000)
    expect(body).toContain('1600')
    expect(body).toContain('v1/dates.json')
    expect(body).toMatch(/artifact/i)
  })

  it('says what ran when it executed, and what the recheck found', () => {
    const body = buildIssueBody({
      ...ctx,
      mode: 'execute',
      decision: decideRestore({
        unhealthy: true,
        mode: 'execute',
        plan: clean,
      }),
      plan: clean,
      executeOutcome: 'success',
      purgeOutcome: 'success',
      recheckUnhealthy: 'false',
    })
    expect(body).toMatch(/restored/i)
    expect(body).toMatch(/CDN/)
    expect(body).toMatch(/healthy/i)
  })

  it('without a plan, says why and where the manual runbook is', () => {
    const body = buildIssueBody({
      ...ctx,
      decision: decideRestore({ unhealthy: true, mode: 'off', plan: null }),
      plan: null,
    })
    expect(body).toContain('docs/runbooks/data-restore.md')
  })
})
