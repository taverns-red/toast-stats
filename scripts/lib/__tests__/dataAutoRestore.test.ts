/**
 * Auto-restore decision logic (#2537, epic #2492). Pure: what mode a repo
 * variable means, which manifest paths are in scope, whether a plan may be
 * executed, and what the data-rollback issue says. The plan itself comes from
 * plan-data-restore.ts (#2539); nothing here plans or touches GCS.
 */

import { describe, it, expect } from 'vitest'
import type { RestorePlan, PlanEntry } from '../dataRestorePlan.js'
import { restoreEligibleFromCanary } from '../cdnSchemaCanary.js'
import { checkCdnLatest } from '../hostingRollback.js'
import {
  DEFAULT_RESTORE_MODE,
  buildIssueBody,
  buildDecisionIssueBody,
  buildDecisionTitle,
  classifyPlanFailure,
  codeSpan,
  buildIssueTitle,
  classifyVerdict,
  decideIntent,
  decideRestore,
  manifestPaths,
  resolveEnumeration,
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

  it('executes only on the exact word `execute`: no trimming, no case folding', () => {
    expect(resolveRestoreMode('execute')).toBe('execute')
    for (const raw of [' execute ', 'Execute', 'EXECUTE', 'execute\n']) {
      expect(resolveRestoreMode(raw), JSON.stringify(raw)).toBe('dry-run')
    }
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
      const d = decideRestore({
        unhealthy: false,
        restoreEligible: true,
        mode,
        plan: clean,
      })
      expect(d).toMatchObject({
        action: 'skip',
        execute: false,
        fileIssue: false,
      })
    }
  })

  it('plans only in dry-run, and files the issue', () => {
    expect(
      decideRestore({
        unhealthy: true,
        restoreEligible: true,
        mode: 'dry-run',
        plan: clean,
      })
    ).toMatchObject({ action: 'plan-only', execute: false, fileIssue: true })
  })

  it('executes a clean plan only in execute mode', () => {
    expect(
      decideRestore({
        unhealthy: true,
        restoreEligible: true,
        mode: 'execute',
        plan: clean,
      })
    ).toMatchObject({ action: 'execute', execute: true, fileIssue: true })
  })

  it('a refused entry aborts the whole execute and still files the issue', () => {
    expect(
      decideRestore({
        unhealthy: true,
        restoreEligible: true,
        mode: 'execute',
        plan: refused,
      })
    ).toMatchObject({ action: 'refused', execute: false, fileIssue: true })
  })

  it('a plan that failed to build never executes and files the issue', () => {
    expect(
      decideRestore({
        unhealthy: true,
        restoreEligible: true,
        mode: 'execute',
        plan: null,
      })
    ).toMatchObject({ action: 'plan-failed', execute: false, fileIssue: true })
  })

  it('a plan with nothing to restore or delete does not execute', () => {
    const idle = planOf([entry('v1/latest.json', 'noop')])
    expect(
      decideRestore({
        unhealthy: true,
        restoreEligible: true,
        mode: 'execute',
        plan: idle,
      })
    ).toMatchObject({
      action: 'nothing-to-do',
      execute: false,
      fileIssue: true,
    })
  })

  it('off files the issue without a plan and never executes', () => {
    expect(
      decideRestore({
        unhealthy: true,
        restoreEligible: true,
        mode: 'off',
        plan: null,
      })
    ).toMatchObject({ action: 'off', execute: false, fileIssue: true })
  })
})

describe('decideRestore: only a decode or validation failure may execute', () => {
  it('an ineligible verdict never executes, says why, and still files the issue', () => {
    for (const mode of ['dry-run', 'execute'] as const) {
      const d = decideRestore({
        unhealthy: true,
        restoreEligible: false,
        ineligibleReason: 'the schema check failed only on freshness',
        mode,
        plan: clean,
      })
      expect(d, mode).toMatchObject({
        action: 'not-eligible',
        execute: false,
        fileIssue: true,
      })
      expect(d.reason).toContain('freshness')
    }
  })

  it('an ineligible verdict with no plan still reports plan-failed or off, not execute', () => {
    expect(
      decideRestore({
        unhealthy: true,
        restoreEligible: false,
        mode: 'execute',
        plan: null,
      }).execute
    ).toBe(false)
    expect(
      decideRestore({
        unhealthy: true,
        restoreEligible: false,
        mode: 'off',
        plan: null,
      }).action
    ).toBe('off')
  })

  it('an eligible verdict and a clean plan in execute mode executes', () => {
    expect(
      decideRestore({
        unhealthy: true,
        restoreEligible: true,
        mode: 'execute',
        plan: clean,
      }).execute
    ).toBe(true)
  })
})

describe('decideIntent: the token-free decision, before any plan', () => {
  const base = { unhealthy: true, restoreEligible: true }

  it('healthy files nothing and executes nothing', () => {
    for (const mode of ['off', 'dry-run', 'execute'] as const) {
      expect(decideIntent({ ...base, unhealthy: false, mode })).toMatchObject({
        action: 'skip',
        execute: false,
        fileIssue: false,
      })
    }
  })

  it('execute mode and an eligible verdict says execute', () => {
    expect(decideIntent({ ...base, mode: 'execute' })).toMatchObject({
      action: 'execute',
      execute: true,
      fileIssue: true,
    })
  })

  it('execute mode and an ineligible verdict never executes, and says why', () => {
    const d = decideIntent({
      ...base,
      restoreEligible: false,
      ineligibleReason: 'only freshness failed',
      mode: 'execute',
    })
    expect(d).toMatchObject({
      action: 'not-eligible',
      execute: false,
      fileIssue: true,
    })
    expect(d.reason).toContain('only freshness failed')
  })

  it('dry-run never executes, eligible or not', () => {
    for (const restoreEligible of [true, false]) {
      expect(
        decideIntent({ ...base, restoreEligible, mode: 'dry-run' }).execute
      ).toBe(false)
    }
    expect(decideIntent({ ...base, mode: 'dry-run' }).action).toBe('dry-run')
  })

  it('off never executes and still files the issue', () => {
    expect(decideIntent({ ...base, mode: 'off' })).toMatchObject({
      action: 'off',
      execute: false,
      fileIssue: true,
    })
  })
})

describe('buildDecisionIssueBody: no object list, a manual plan command', () => {
  const ctx = {
    mode: 'dry-run' as const,
    decision: decideIntent({
      unhealthy: true,
      restoreEligible: true,
      mode: 'dry-run',
    }),
    runId: '4242',
    runUrl: 'https://github.com/taverns-red/toast-stats/actions/runs/4242',
    failed: 'the schema check',
    stagingBucket: 'toast-stats-data-staging',
    prodBucket: 'toast-stats-data-ca',
    promoteStarted: '2026-11-14T10:00:00Z',
    windowEnd: '2026-11-14T10:40:00Z',
  }

  it('names the run id, verdict, reason, mode and the manifest path', () => {
    const body = buildDecisionIssueBody(ctx)
    expect(body).toContain('4242')
    expect(body).toContain(ctx.runUrl)
    expect(body).toContain('the schema check')
    expect(body).toContain(ctx.decision.reason)
    expect(body).toContain('dry-run')
    expect(body).toContain(
      'gs://toast-stats-data-staging/runs/4242/written.jsonl'
    )
  })

  it('gives the exact plan command with the run window', () => {
    const body = buildDecisionIssueBody(ctx)
    expect(body).toContain('plan-data-restore.ts')
    expect(body).toContain('--since 2026-11-14T10:00:00Z')
    expect(body).toContain('--until 2026-11-14T10:40:00Z')
    expect(body).toContain('--paths')
    expect(body).toContain('list-restore-candidates.sh')
    expect(body).toContain('docs/runbooks/data-restore.md')
  })

  it('lists no objects: no table, no generations', () => {
    const body = buildDecisionIssueBody(ctx)
    expect(body).not.toMatch(/\| Object \|/)
    expect(body).not.toMatch(/generation/i)
  })

  it('says whether an execute was started or why it was not', () => {
    const exec = buildDecisionIssueBody({
      ...ctx,
      mode: 'execute',
      decision: decideIntent({
        unhealthy: true,
        restoreEligible: true,
        mode: 'execute',
      }),
    })
    expect(exec).toMatch(/execute job/i)
    const no = buildDecisionIssueBody({
      ...ctx,
      decision: decideIntent({
        unhealthy: true,
        restoreEligible: false,
        ineligibleReason: 'only freshness failed',
        mode: 'execute',
      }),
    })
    expect(no).toContain('only freshness failed')
    expect(buildDecisionTitle('execute')).not.toBe(
      buildDecisionTitle('dry-run')
    )
    expect(buildDecisionTitle('dry-run')).toMatch(/data-rollback/)
  })
})

describe('resolveEnumeration: what the decide job learned about the plan (#2858)', () => {
  it('a plan that loaded is shown, whatever the planner exit said', () => {
    expect(
      resolveEnumeration({
        authOutcome: 'success',
        enumOutcome: 'success',
        errorClass: '',
        plan: clean,
      })
    ).toEqual({ kind: 'plan', plan: clean })
    // a refused plan exits non-zero but still carries its refused entries
    expect(
      resolveEnumeration({
        authOutcome: 'success',
        enumOutcome: 'failure',
        errorClass: 'plan-refused',
        plan: refused,
      })
    ).toEqual({ kind: 'plan', plan: refused })
  })

  it('a failed auth is named by class, never by the error text', () => {
    expect(
      resolveEnumeration({
        authOutcome: 'failure',
        enumOutcome: 'skipped',
        errorClass: '',
        plan: null,
      })
    ).toEqual({ kind: 'failed', errorClass: 'auth-failed' })
  })

  it('a step that failed with a known class reports it; an unknown or hostile class collapses', () => {
    expect(
      resolveEnumeration({
        authOutcome: 'success',
        enumOutcome: 'failure',
        errorClass: 'manifest-unreadable',
        plan: null,
      })
    ).toEqual({ kind: 'failed', errorClass: 'manifest-unreadable' })
    expect(
      resolveEnumeration({
        authOutcome: 'success',
        enumOutcome: 'failure',
        errorClass: 'PERMISSION_DENIED reader@project.iam.gserviceaccount.com',
        plan: null,
      })
    ).toEqual({ kind: 'failed', errorClass: 'plan-failed' })
  })

  it('auth not attempted (not main, or mode off) is skipped, not a failure', () => {
    expect(
      resolveEnumeration({
        authOutcome: 'skipped',
        enumOutcome: 'skipped',
        errorClass: '',
        plan: null,
      })
    ).toEqual({ kind: 'skipped' })
  })
})

describe('classifyPlanFailure: why the planner exited non-zero (#2858)', () => {
  it('a plan that was written is a genuine refusal', () => {
    expect(
      classifyPlanFailure({
        stderr: '1 object(s) refused: resolve by hand\n',
        planWritten: true,
      })
    ).toBe('plan-refused')
  })

  it('a listing error is a listing failure, not a refusal', () => {
    expect(
      classifyPlanFailure({
        stderr:
          'refused: the soft-deleted listing reported an error other than "matched no objects": ERROR: x; the listing may be incomplete, re-run it\n',
        planWritten: false,
      })
    ).toBe('listing-failed')
    expect(
      classifyPlanFailure({
        stderr: 'refused: listing is not a JSON array\n',
        planWritten: false,
      })
    ).toBe('listing-failed')
  })

  it('anything else without a plan is a plain failure', () => {
    expect(
      classifyPlanFailure({
        stderr: 'error: boom\n',
        planWritten: false,
      })
    ).toBe('plan-failed')
    expect(classifyPlanFailure({ stderr: '', planWritten: false })).toBe(
      'plan-failed'
    )
  })
})

describe('resolveEnumeration: an empty reader variable (#2858)', () => {
  it('a failed precheck is auth-failed even though auth was skipped', () => {
    expect(
      resolveEnumeration({
        authOutcome: 'skipped',
        precheckOutcome: 'failure',
        enumOutcome: 'skipped',
        errorClass: '',
        plan: null,
      })
    ).toEqual({ kind: 'failed', errorClass: 'auth-failed' })
  })
})

describe('codeSpan: names with backticks render safely (#2858)', () => {
  it('uses a longer fence than any backtick run in the name', () => {
    expect(codeSpan('plain.json')).toBe('`plain.json`')
    expect(codeSpan('a`b')).toBe('`` a`b ``')
    expect(codeSpan('a``b')).toBe('``` a``b ```')
  })

  it('the decision issue table does not let a name break out of its span', () => {
    const plan = planOf([entry('v1/x`|y.json', 'restore')])
    const body = buildDecisionIssueBody({
      mode: 'dry-run',
      decision: decideIntent({
        unhealthy: true,
        restoreEligible: true,
        mode: 'dry-run',
      }),
      runId: '1',
      runUrl: 'u',
      failed: 'f',
      stagingBucket: 's',
      prodBucket: 'p',
      promoteStarted: '',
      windowEnd: '',
      enumeration: { kind: 'plan', plan },
    })
    expect(body).toContain('`` v1/x`|y.json ``')
  })

  it('the execute report does the same', () => {
    const body = buildIssueBody({
      mode: 'dry-run',
      decision: decideRestore({
        unhealthy: true,
        restoreEligible: true,
        mode: 'dry-run',
        plan: planOf([entry('v1/x`y.json', 'restore')]),
      }),
      plan: planOf([entry('v1/x`y.json', 'restore')]),
      runUrl: 'u',
      failed: 'f',
    })
    expect(body).toContain('`` v1/x`y.json ``')
  })
})

describe('buildDecisionIssueBody: the enumerated plan (#2858)', () => {
  const base = {
    mode: 'dry-run' as const,
    decision: decideIntent({
      unhealthy: true,
      restoreEligible: true,
      mode: 'dry-run',
    }),
    runId: '4242',
    runUrl: 'https://github.com/taverns-red/toast-stats/actions/runs/4242',
    failed: 'the schema check',
    stagingBucket: 'toast-stats-data-staging',
    prodBucket: 'toast-stats-data-ca',
    promoteStarted: '2026-11-14T10:00:00Z',
    windowEnd: '2026-11-14T10:40:00Z',
  }

  it('lists the plan and keeps the manual command', () => {
    const body = buildDecisionIssueBody({
      ...base,
      enumeration: { kind: 'plan', plan: clean },
    })
    expect(body).toContain('`v1/latest.json`')
    expect(body).toContain('snapshots/2026-11-14/metadata.json')
    expect(body).toContain('1 to restore')
    expect(body).toContain('plan-data-restore.ts')
    expect(body).toContain('data-restore-plan-dry-run')
  })

  it('shows refused entries', () => {
    const body = buildDecisionIssueBody({
      ...base,
      enumeration: { kind: 'plan', plan: refused },
    })
    expect(body).toContain('`v1/dates.json`')
    expect(body).toMatch(/refused/i)
  })

  it('truncates a large plan with a count, and stays under the issue size limit', () => {
    const many = planOf(
      Array.from({ length: 1500 }, (_, i) =>
        entry(`snapshots/2026-11-14/district_${i}.json`, 'restore')
      )
    )
    const body = buildDecisionIssueBody({
      ...base,
      enumeration: { kind: 'plan', plan: many },
    })
    expect(body).toContain('1500 object(s)')
    expect(body).toMatch(/and \d+ more/)
    expect(body.length).toBeLessThan(60000)
  })

  it('says enumeration failed with the class only, and still gives the manual command', () => {
    const body = buildDecisionIssueBody({
      ...base,
      enumeration: { kind: 'failed', errorClass: 'auth-failed' },
    })
    expect(body).toContain('enumeration failed: auth-failed')
    expect(body).toContain('plan-data-restore.ts')
    expect(body).not.toMatch(/iam\.gserviceaccount|projects\//)
  })

  it('a skipped enumeration says so', () => {
    const body = buildDecisionIssueBody({
      ...base,
      enumeration: { kind: 'skipped' },
    })
    expect(body).toMatch(/enumeration skipped/)
  })
})

describe('classifyVerdict', () => {
  const ok = { smokeHealthy: 'true', smokeFailures: [] as string[] }
  const schemaOk = { schemaUnhealthy: 'false', schemaRestoreEligible: '' }

  it('a cdn-data decode or validation failure is eligible', () => {
    const notJson = checkCdnLatest(200, 'oops').detail
    const noDate = checkCdnLatest(200, '{}').detail
    for (const detail of [notJson, noDate]) {
      const v = classifyVerdict({
        smokeHealthy: 'false',
        smokeFailures: [`cdn-data: ${detail}`],
        ...schemaOk,
      })
      expect(v.restoreEligible, detail).toBe(true)
    }
  })

  it('a schema check that failed on decode or validation is eligible', () => {
    const v = classifyVerdict({
      ...ok,
      schemaUnhealthy: 'true',
      schemaRestoreEligible: 'true',
    })
    expect(v.restoreEligible).toBe(true)
  })

  it('a Hosting probe failure is not eligible, and says so', () => {
    for (const probe of ['home', 'entry-asset', 'district']) {
      const v = classifyVerdict({
        smokeHealthy: 'false',
        smokeFailures: [`${probe}: HTTP 500`],
        ...schemaOk,
      })
      expect(v.restoreEligible, probe).toBe(false)
      expect(v.reason).toContain(probe)
    }
  })

  it('a cdn-data probe that failed on HTTP status is not eligible', () => {
    const v = classifyVerdict({
      smokeHealthy: 'false',
      smokeFailures: ['cdn-data: HTTP 503'],
      ...schemaOk,
    })
    expect(v.restoreEligible).toBe(false)
  })

  it('a decode failure mixed with a Hosting probe failure is not eligible', () => {
    const v = classifyVerdict({
      smokeHealthy: 'false',
      smokeFailures: ['cdn-data: latest.json is not JSON', 'home: HTTP 500'],
      ...schemaOk,
    })
    expect(v.restoreEligible).toBe(false)
  })

  it('a crashed or never-run smoke step is not eligible', () => {
    for (const smokeHealthy of ['', 'false']) {
      const v = classifyVerdict({
        smokeHealthy,
        smokeFailures: null,
        schemaUnhealthy: 'true',
        schemaRestoreEligible: 'true',
      })
      expect(v.restoreEligible, smokeHealthy).toBe(false)
      expect(v.reason).toMatch(/smoke/)
    }
  })

  it('a crashed or never-run schema step is not eligible', () => {
    const v = classifyVerdict({
      smokeHealthy: 'false',
      smokeFailures: ['cdn-data: latest.json is not JSON'],
      schemaUnhealthy: '',
      schemaRestoreEligible: '',
    })
    expect(v.restoreEligible).toBe(false)
    expect(v.reason).toMatch(/schema/)
  })

  it('a schema failure that is not decode or validation is not eligible', () => {
    const v = classifyVerdict({
      ...ok,
      schemaUnhealthy: 'true',
      schemaRestoreEligible: 'false',
    })
    expect(v.restoreEligible).toBe(false)
    expect(v.reason).toMatch(/schema/)
  })

  it('healthy on both sides is not eligible: there is nothing to restore', () => {
    expect(classifyVerdict({ ...ok, ...schemaOk }).restoreEligible).toBe(false)
  })
})

describe('restoreEligibleFromCanary', () => {
  const base = {
    healthy: false,
    latestDate: '2026-11-14',
    checked: 1,
    objectsChecked: 1,
    reason: '',
  }
  const district = (reason: string) => ({ districtId: '61', reason })
  const object = (reason: string) => ({ path: 'time-series/x.json', reason })

  it('true for decode and validation failures', () => {
    for (const reason of [
      'schema validation failed: x',
      'invalid JSON: Unexpected token',
      'body is not valid UTF-8',
      'body is still gzip-encoded after HTTP decoding (nested gzip, #1702)',
    ]) {
      expect(
        restoreEligibleFromCanary({
          ...base,
          failures: [district(reason)],
          objectFailures: [],
        }),
        reason
      ).toBe(true)
      expect(
        restoreEligibleFromCanary({
          ...base,
          failures: [],
          objectFailures: [object(reason)],
        }),
        reason
      ).toBe(true)
    }
  })

  it('false for freshness, fetch and shape failures', () => {
    for (const reason of [
      'last data point 2026-11-01 is 13 days old (max 3 days)',
      'last data point 2026-11-20 is in the future',
      'fetch failed: HTTP 503',
      'no data points — the file has no last point',
    ]) {
      expect(
        restoreEligibleFromCanary({
          ...base,
          failures: [],
          objectFailures: [object(reason)],
        }),
        reason
      ).toBe(false)
    }
  })

  it('false when a decode failure is mixed with a freshness failure', () => {
    expect(
      restoreEligibleFromCanary({
        ...base,
        failures: [],
        objectFailures: [
          object('schema validation failed: x'),
          object('last data point 2026-11-01 is 13 days old (max 3 days)'),
        ],
      })
    ).toBe(false)
  })

  it('false when healthy, or when it could not even resolve the snapshot', () => {
    expect(
      restoreEligibleFromCanary({
        ...base,
        healthy: true,
        failures: [],
        objectFailures: [],
      })
    ).toBe(false)
    expect(
      restoreEligibleFromCanary({
        ...base,
        checked: 0,
        failures: [],
        objectFailures: [],
      })
    ).toBe(false)
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
        restoreEligible: true,
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
      decision: decideRestore({
        unhealthy: true,
        restoreEligible: true,
        mode: 'dry-run',
        plan: p,
      }),
      plan: p,
    })
    expect(body).toContain('a\\\\\\|b \\| c')
  })

  it('escapes backticks in a reason so it cannot open a code span in the table', () => {
    const p = planOf([entry('v1/a.json', 'refuse', { reason: 'bad `x` here' })])
    const body = buildIssueBody({
      ...ctx,
      decision: decideRestore({
        unhealthy: true,
        restoreEligible: true,
        mode: 'dry-run',
        plan: p,
      }),
      plan: p,
    })
    expect(body).toContain('bad \\`x\\` here')
  })

  it('an ineligible verdict says why in the issue', () => {
    const d = decideRestore({
      unhealthy: true,
      restoreEligible: false,
      ineligibleReason: 'the schema check failed only on freshness',
      mode: 'execute',
      plan: clean,
    })
    const body = buildIssueBody({
      ...ctx,
      mode: 'execute',
      decision: d,
      plan: clean,
    })
    expect(body).toContain('not-eligible')
    expect(body).toContain('only on freshness')
    expect(buildIssueTitle('not-eligible')).toMatch(/no restore/)
  })

  it('lists restores with the generation to restore and deletes by name', () => {
    const body = buildIssueBody({
      ...ctx,
      decision: decideRestore({
        unhealthy: true,
        restoreEligible: true,
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
        restoreEligible: true,
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
        restoreEligible: true,
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
      decision: decideRestore({
        unhealthy: true,
        restoreEligible: true,
        mode: 'off',
        plan: null,
      }),
      plan: null,
    })
    expect(body).toContain('docs/runbooks/data-restore.md')
  })
})
