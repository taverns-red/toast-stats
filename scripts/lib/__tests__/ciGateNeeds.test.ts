import { describe, it, expect } from 'vitest'
import { classifyChanges, evaluateNeeds, type NeedResult } from '../ciGateNeeds'

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
