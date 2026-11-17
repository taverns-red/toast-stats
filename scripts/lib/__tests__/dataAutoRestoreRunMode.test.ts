/**
 * Execute applies only to daily and rebuild runs (#2856, COO decision 3,
 * 2026-11-17). Proofs, backfills, rescrapes and prune get a plan only. The
 * check fails closed: an unknown or empty run mode never executes.
 */

import { describe, it, expect } from 'vitest'
import type { PlanEntry, RestorePlan } from '../dataRestorePlan.js'
import {
  buildIssueBody,
  decideIntent,
  decideRestore,
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
const clean = planOf([entry('v1/latest.json', 'restore')])

const RUN_MODES_THAT_MAY_EXECUTE = ['daily', 'rebuild']
const RUN_MODES_THAT_MAY_NOT = [
  'rescrape',
  'rescrape-historical',
  'prune',
  'backfill-global-totals',
  'backfill-education-ledger',
  '',
  'Daily',
  ' daily',
  'unknown',
]

describe('decideIntent: execute is limited to daily and rebuild (#2856)', () => {
  const base = {
    unhealthy: true,
    restoreEligible: true,
    mode: 'execute' as const,
  }

  it.each(RUN_MODES_THAT_MAY_EXECUTE)('%s may execute', runMode => {
    expect(decideIntent({ ...base, runMode })).toMatchObject({
      action: 'execute',
      execute: true,
    })
  })

  it.each(RUN_MODES_THAT_MAY_NOT)(
    'run mode %j is refused: plan only, issue still filed',
    runMode => {
      const d = decideIntent({ ...base, runMode })
      expect(d).toMatchObject({
        action: 'mode-refused',
        execute: false,
        fileIssue: true,
      })
      expect(d.reason).toMatch(/daily and rebuild/)
    }
  )

  it('no run mode at all is refused', () => {
    expect(decideIntent({ ...base }).execute).toBe(false)
  })

  it('a dry-run variable stays a dry run in every run mode', () => {
    for (const runMode of [...RUN_MODES_THAT_MAY_EXECUTE, 'prune']) {
      expect(decideIntent({ ...base, mode: 'dry-run', runMode })).toMatchObject(
        { action: 'dry-run', execute: false }
      )
    }
  })
})

describe('decideRestore: execute is limited to daily and rebuild (#2856)', () => {
  const base = {
    unhealthy: true,
    restoreEligible: true,
    mode: 'execute' as const,
    plan: clean,
  }

  it.each(RUN_MODES_THAT_MAY_EXECUTE)('%s executes a clean plan', runMode => {
    expect(decideRestore({ ...base, runMode })).toMatchObject({
      action: 'execute',
      execute: true,
    })
  })

  it.each(RUN_MODES_THAT_MAY_NOT)(
    'run mode %j never executes, even a clean plan',
    runMode => {
      expect(decideRestore({ ...base, runMode })).toMatchObject({
        action: 'mode-refused',
        execute: false,
        fileIssue: true,
      })
    }
  )

  it('says in the issue that the run mode only gets a plan', () => {
    const decision = decideRestore({ ...base, runMode: 'prune' })
    const body = buildIssueBody({
      mode: 'execute',
      decision,
      plan: clean,
      runUrl: 'https://example.test/run/1',
      failed: 'the schema check',
    })
    expect(body).toContain('mode-refused')
    expect(body).toMatch(/daily and rebuild/)
  })
})

describe('the issue lists deliberate and manual removals apart from restores (#2856)', () => {
  const plan = planOf([
    entry('v1/latest.json', 'restore'),
    entry('snapshots/2026-10-10/district_U.json', 'excluded', {
      liveGeneration: '0',
      reason: 'removed on purpose (#2232), not restored',
    }),
    entry('snapshots/2026-09-15/', 'manual', {
      liveGeneration: '0',
      reason: 'a prune delete: not restorable automatically',
    }),
  ])
  const body = buildIssueBody({
    mode: 'dry-run',
    decision: decideRestore({
      unhealthy: true,
      restoreEligible: true,
      mode: 'dry-run',
      runMode: 'daily',
      plan,
    }),
    plan,
    runUrl: 'https://example.test/run/1',
    failed: 'the schema check',
  })

  it('names the removed-on-purpose object and why it is left alone', () => {
    expect(body).toContain('snapshots/2026-10-10/district_U.json')
    expect(body).toMatch(/removed on purpose/)
  })

  it('names the prune delete a person must decide', () => {
    expect(body).toContain('snapshots/2026-09-15/')
    expect(body).toMatch(/not restorable automatically/)
  })

  it('counts them in the summary line', () => {
    expect(body).toMatch(/1 removed on purpose/)
    expect(body).toMatch(/1 not restorable automatically/)
  })

  it('a plan with only such entries has nothing to restore', () => {
    const only = planOf([plan.entries[1]!, plan.entries[2]!])
    expect(
      decideRestore({
        unhealthy: true,
        restoreEligible: true,
        mode: 'execute',
        runMode: 'daily',
        plan: only,
      }).action
    ).toBe('nothing-to-do')
  })
})
