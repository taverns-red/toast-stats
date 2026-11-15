import { describe, it, expect } from 'vitest'
import {
  classifyChanges,
  evaluateHeadChecks,
  evaluateNeeds,
  type HeadCheckRun,
  type NeedResult,
} from '../ciGateNeeds'

const ok = (outputs?: Record<string, string>): NeedResult => ({
  result: 'success',
  outputs,
})
const r = (result: string): NeedResult => ({ result })

const codeNeeds = (over: Record<string, NeedResult> = {}) => ({
  changes: ok({ code: 'true', docs: 'false' }),
  'quality-gates': ok(),
  test: ok(),
  build: ok(),
  'docs-gate': r('skipped'),
  ...over,
})
const docsNeeds = (over: Record<string, NeedResult> = {}) => ({
  changes: ok({ code: 'false', docs: 'true' }),
  'quality-gates': r('skipped'),
  test: r('skipped'),
  build: r('skipped'),
  'docs-gate': ok(),
  ...over,
})

describe('classifyChanges — mirrors the path filters the gate replaced', () => {
  it('code-only diff: code, no docs', () => {
    expect(classifyChanges(['frontend/src/a.ts'])).toEqual({
      code: true,
      docs: false,
    })
  })
  it('docs-only diff: docs, no code', () => {
    expect(classifyChanges(['README.md', 'tasks/x.txt'])).toEqual({
      code: false,
      docs: true,
    })
  })
  it('mixed diff: both', () => {
    expect(classifyChanges(['a.ts', 'docs/x.md'])).toEqual({
      code: true,
      docs: true,
    })
  })
  it('empty diff is not a free pass: it expects the code set', () => {
    expect(classifyChanges([]).code).toBe(true)
  })
})

describe('evaluateNeeds — fail closed (#1484 semantics, #2607)', () => {
  it('passes a code PR when the ci jobs succeeded and docs skipped', () => {
    expect(evaluateNeeds(codeNeeds(), { noop: false }).pass).toBe(true)
  })
  it('passes a docs-only PR when only Docs Gate ran', () => {
    expect(evaluateNeeds(docsNeeds(), { noop: false }).pass).toBe(true)
  })
  it('passes a mixed PR when everything succeeded', () => {
    const n = codeNeeds({
      changes: ok({ code: 'true', docs: 'true' }),
      'docs-gate': ok(),
    })
    expect(evaluateNeeds(n, { noop: false }).pass).toBe(true)
  })

  it.each(['quality-gates', 'test', 'build'])(
    'fails a code PR when %s is skipped (a skip must not read as success)',
    job => {
      const v = evaluateNeeds(codeNeeds({ [job]: r('skipped') }), {
        noop: false,
      })
      expect(v.pass).toBe(false)
      expect(v.reasons.join(' ')).toContain(job)
    }
  )
  it.each(['failure', 'cancelled', 'skipped'])(
    'fails a docs PR when docs-gate is %s',
    res => {
      expect(
        evaluateNeeds(docsNeeds({ 'docs-gate': r(res) }), { noop: false }).pass
      ).toBe(false)
    }
  )
  it('fails a mixed PR when docs-gate did not run', () => {
    const n = codeNeeds({
      changes: ok({ code: 'true', docs: 'true' }),
    })
    expect(evaluateNeeds(n, { noop: false }).pass).toBe(false)
  })
  it.each(['failure', 'cancelled', 'skipped'])(
    'fails when the changes job is %s',
    res => {
      expect(
        evaluateNeeds(codeNeeds({ changes: r(res) }), { noop: false }).pass
      ).toBe(false)
    }
  )
  it('fails when neither code nor docs is expected (classifier bug)', () => {
    const n = codeNeeds({ changes: ok({ code: 'false', docs: 'false' }) })
    expect(evaluateNeeds(n, { noop: false }).pass).toBe(false)
  })
  it('fails when the changes outputs are missing', () => {
    expect(
      evaluateNeeds(codeNeeds({ changes: ok() }), { noop: false }).pass
    ).toBe(false)
  })
  it('fails when a needed job is absent from the needs context', () => {
    const n = codeNeeds()
    delete (n as Record<string, NeedResult>).build
    expect(evaluateNeeds(n, { noop: false }).pass).toBe(false)
  })
  it('does not fail a job that legitimately skipped (docs on a code PR)', () => {
    expect(evaluateNeeds(codeNeeds(), { noop: false }).reasons).toEqual([])
  })

  it('a no-op edit (title/body) passes with every job skipped', () => {
    const n = {
      changes: r('skipped'),
      'quality-gates': r('skipped'),
      test: r('skipped'),
      build: r('skipped'),
      'docs-gate': r('skipped'),
    }
    expect(evaluateNeeds(n, { noop: true }).pass).toBe(true)
  })
})

// A body/title-only `edited` run skips every job, so the gate re-verifies the
// head SHA's check runs once instead (#2607). Reproduces the canary sequence:
// a red head, then a body-only edit, must not turn CI Gate green.
describe('evaluateHeadChecks — a no-op edit re-verifies the head', () => {
  const NAMES = ['Quality Gates', 'Test Suite', 'Build Applications']
  const run = (
    name: string,
    conclusion: string | null,
    extra: Partial<HeadCheckRun> = {}
  ): HeadCheckRun => ({
    name,
    status: conclusion === null ? 'in_progress' : 'completed',
    conclusion,
    app: { slug: 'github-actions' },
    ...extra,
  })
  const green = NAMES.map((n, i) =>
    run(n, 'success', { id: 10 + i, started_at: '2026-11-15T01:00:00Z' })
  )
  // The skipped jobs the edit-triggered run itself creates.
  const editSkips = NAMES.map((n, i) =>
    run(n, 'skipped', { id: 90 + i, started_at: '2026-11-15T02:00:00Z' })
  )

  it('ignores a same-named RED check from another app (cannot pin the gate)', () => {
    const foreign = run('Test Suite', 'failure', {
      id: 500,
      started_at: '2026-11-15T03:00:00Z',
      app: { slug: 'some-other-app' },
    })
    expect(
      evaluateHeadChecks(NAMES, [...green, ...editSkips, foreign]).pass
    ).toBe(true)
  })
  it('does not accept a same-named GREEN check from another app', () => {
    const foreign = NAMES.map((n, i) =>
      run(n, 'success', {
        id: 600 + i,
        started_at: '2026-11-15T03:00:00Z',
        app: { slug: 'some-other-app' },
      })
    )
    expect(evaluateHeadChecks(NAMES, [...foreign, ...editSkips]).pass).toBe(
      false
    )
  })
  it('does not accept a check run that carries no app', () => {
    const noApp = NAMES.map((n, i) =>
      run(n, 'success', { id: 700 + i, app: undefined })
    )
    expect(evaluateHeadChecks(NAMES, noApp).pass).toBe(false)
  })
  it('passes an edit after an all-green head, ignoring the edit run skips', () => {
    expect(evaluateHeadChecks(NAMES, [...green, ...editSkips]).pass).toBe(true)
  })
  it('FAILS an edit on a red head (the canary: a failed Docs Gate)', () => {
    const v = evaluateHeadChecks(
      ['Docs Gate', ...NAMES],
      [...green, ...editSkips, run('Docs Gate', 'failure', { id: 50 })]
    )
    expect(v.pass).toBe(false)
    expect(v.reasons.join(' ')).toContain('Docs Gate')
  })
  it('FAILS when an expected check is missing', () => {
    const v = evaluateHeadChecks(NAMES, [green[0]!, green[1]!, ...editSkips])
    expect(v.pass).toBe(false)
    expect(v.reasons.join(' ')).toContain('Build Applications')
  })
  it('FAILS when an expected check is still in flight (no waiting)', () => {
    const v = evaluateHeadChecks(NAMES, [
      green[0]!,
      run('Test Suite', null, { id: 30 }),
      ...editSkips,
    ])
    expect(v.pass).toBe(false)
    expect(v.reasons.join(' ')).toContain('Test Suite')
  })
  it('FAILS when the only runs of an expected check are skipped', () => {
    expect(evaluateHeadChecks(NAMES, editSkips).pass).toBe(false)
  })
  it('uses the latest non-skipped run: a green re-run beats an older red', () => {
    const rerun = [
      run('Test Suite', 'failure', {
        id: 5,
        started_at: '2026-11-15T00:00:00Z',
      }),
      run('Test Suite', 'success', {
        id: 6,
        started_at: '2026-11-15T00:30:00Z',
      }),
    ]
    expect(
      evaluateHeadChecks(['Test Suite'], [...rerun, ...editSkips]).pass
    ).toBe(true)
  })
  it('a newer red re-run beats an older green', () => {
    const rerun = [
      run('Test Suite', 'success', {
        id: 5,
        started_at: '2026-11-15T00:00:00Z',
      }),
      run('Test Suite', 'failure', {
        id: 6,
        started_at: '2026-11-15T00:30:00Z',
      }),
    ]
    expect(evaluateHeadChecks(['Test Suite'], rerun).pass).toBe(false)
  })
  it('fails closed on an empty expectation', () => {
    expect(evaluateHeadChecks([], green).pass).toBe(false)
  })
})
