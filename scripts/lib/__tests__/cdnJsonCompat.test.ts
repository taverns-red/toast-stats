/**
 * CDN JSON compatibility guard (#2494, ADR 0019 steps 1 and 3).
 *
 * Backward: the latest release's reader schemas must parse the fixtures at
 * the PR head. Forward: the PR's reader schemas must parse the release's
 * fixtures. Anything the guard cannot build, load or verify is a failure,
 * never a skip. A breaking change passes only with `db-breaking-approved`
 * present and last applied by rservant, or when its fixture's content hash is
 * grandfathered.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import * as contracts from '@taverns-red/shared-contracts'

import {
  COMPAT_FIXTURES,
  OVERRIDE_APPROVER,
  OVERRIDE_LABEL,
  applyGrandfather,
  compareCompat,
  decide,
  fetchOverride,
  fixtureHash,
  loadFixtures,
  readerSchemasOf,
  verifyOverride,
  type Finding,
  type FixtureSet,
  type IssueEvent,
  type SchemaSet,
} from '../cdnJsonCompat'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

const ok = (payload: unknown) => ({ ok: true as const, payload })

const OLD = z.object({ name: z.string(), count: z.number() })
const V1 = { name: 'a', count: 1 }

const compare = (
  base: { schemas: SchemaSet; fixtures: FixtureSet },
  head: { schemas: SchemaSet; fixtures: FixtureSet }
) => compareCompat({ base, head })

describe('backward: the release reads the PR head fixtures', () => {
  const base = { schemas: { Thing: OLD }, fixtures: { Thing: ok(V1) } }

  it('an additive field passes', () => {
    // Additive means the writer adds it and the reader tolerates its
    // absence; a reader that requires it is the forward case below.
    const head = {
      schemas: { Thing: OLD.extend({ extra: z.boolean().optional() }) },
      fixtures: { Thing: ok({ ...V1, extra: true }) },
    }
    expect(compare(base, head)).toEqual([])
  })

  it('a removed field fails', () => {
    const head = {
      schemas: { Thing: z.object({ name: z.string() }) },
      fixtures: { Thing: ok({ name: 'a' }) },
    }
    const findings = compare(base, head)
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({
      direction: 'backward',
      reader: 'Thing',
      kind: 'rejected',
    })
    expect(findings[0]?.detail).toContain('count')
    expect(findings[0]?.hash).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('a retyped field fails', () => {
    const head = {
      schemas: { Thing: z.object({ name: z.string(), count: z.string() }) },
      fixtures: { Thing: ok({ name: 'a', count: '1' }) },
    }
    // Neither side reads the other's `count`.
    expect(compare(base, head)).toMatchObject([
      { direction: 'backward', reader: 'Thing', kind: 'rejected' },
      { direction: 'forward', reader: 'Thing', kind: 'rejected' },
    ])
  })

  it('a missing head fixture fails, never skips', () => {
    expect(
      compare(base, { schemas: { Thing: OLD }, fixtures: {} })
    ).toMatchObject([
      { direction: 'backward', reader: 'Thing', kind: 'missing-fixture' },
    ])
    expect(
      compare(base, {
        schemas: { Thing: OLD },
        fixtures: { Thing: { ok: false, error: 'no such file' } },
      })
    ).toMatchObject([
      {
        direction: 'backward',
        kind: 'missing-fixture',
        detail: expect.stringContaining('no such file'),
      },
    ])
  })

  it('no reader schemas at the release fails', () => {
    const head = { schemas: { Thing: OLD }, fixtures: { Thing: ok(V1) } }
    expect(compare({ schemas: {}, fixtures: {} }, head)).toMatchObject([
      { kind: 'missing-schema' },
    ])
  })
})

describe('forward: the PR head reads the release fixtures', () => {
  it('a field the PR now requires fails on the release fixture', () => {
    const base = { schemas: { Thing: OLD }, fixtures: { Thing: ok(V1) } }
    const head = {
      schemas: { Thing: OLD.extend({ extra: z.boolean() }) },
      fixtures: { Thing: ok({ ...V1, extra: true }) },
    }
    // Backward is fine (the old reader strips `extra`); forward is not.
    expect(compare(base, head)).toMatchObject([
      { direction: 'forward', reader: 'Thing', kind: 'rejected' },
    ])
  })

  it('a missing release fixture fails', () => {
    const base = { schemas: { Thing: OLD }, fixtures: {} }
    const head = { schemas: { Thing: OLD }, fixtures: { Thing: ok(V1) } }
    expect(compare(base, head)).toMatchObject([
      { direction: 'forward', reader: 'Thing', kind: 'missing-fixture' },
    ])
  })

  it('a reader new at the PR head needs its own fixture', () => {
    const base = { schemas: { Thing: OLD }, fixtures: { Thing: ok(V1) } }
    const head = {
      schemas: { Thing: OLD, Fresh: OLD },
      fixtures: { Thing: ok(V1), Fresh: ok(V1) },
    }
    expect(compare(base, head)).toEqual([])
    expect(
      compare(base, { ...head, fixtures: { Thing: ok(V1) } })
    ).toMatchObject([{ reader: 'Fresh', kind: 'missing-fixture' }])
  })

  it('no reader schemas at the PR head fails', () => {
    const base = { schemas: { Thing: OLD }, fixtures: { Thing: ok(V1) } }
    expect(compare(base, { schemas: {}, fixtures: { Thing: ok(V1) } })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'missing-schema' }),
      ])
    )
  })
})

describe('grandfathering is by content hash, not by name', () => {
  const base = { schemas: { Thing: OLD }, fixtures: { Thing: ok(V1) } }
  const head = {
    schemas: { Thing: z.object({ name: z.string() }) },
    fixtures: { Thing: ok({ name: 'a' }) },
  }
  const [finding] = compare(base, head) as [Finding]

  it('the hash ignores key order and changes with content', () => {
    expect(
      fixtureHash('Thing', 'backward', { a: 1, b: [1, { c: 2, d: 3 }] })
    ).toBe(fixtureHash('Thing', 'backward', { b: [1, { d: 3, c: 2 }], a: 1 }))
    expect(fixtureHash('Thing', 'backward', { a: 1 })).not.toBe(
      fixtureHash('Thing', 'backward', { a: 2 })
    )
    expect(fixtureHash('Thing', 'backward', { a: 1 })).not.toBe(
      fixtureHash('Thing', 'forward', { a: 1 })
    )
  })

  it('a known hash is grandfathered', () => {
    const r = applyGrandfather(
      [finding],
      [
        {
          hash: finding.hash!,
          reader: 'Thing',
          direction: 'backward',
          reason: 'x',
        },
      ]
    )
    expect(r.breaking).toEqual([])
    expect(r.grandfathered).toEqual([finding])
  })

  it('an unknown hash fails', () => {
    const edited = compare(base, {
      ...head,
      fixtures: { Thing: ok({ name: 'edited under the same name' }) },
    })
    const r = applyGrandfather(edited, [
      {
        hash: finding.hash!,
        reader: 'Thing',
        direction: 'backward',
        reason: 'x',
      },
    ])
    expect(r.breaking).toEqual(edited)
    expect(r.grandfathered).toEqual([])
  })

  it('a hash pinned for another reader or direction does not apply', () => {
    for (const entry of [
      { hash: finding.hash!, reader: 'Other', direction: 'backward' as const },
      { hash: finding.hash!, reader: 'Thing', direction: 'forward' as const },
    ]) {
      expect(
        applyGrandfather([finding], [{ ...entry, reason: 'x' }]).breaking
      ).toEqual([finding])
    }
  })

  it('a missing fixture is never grandfathered', () => {
    const missing: Finding = {
      direction: 'backward',
      reader: 'Thing',
      kind: 'missing-fixture',
      detail: 'gone',
    }
    expect(
      applyGrandfather(
        [missing],
        [{ hash: '', reader: 'Thing', direction: 'backward', reason: 'x' }]
      ).breaking
    ).toEqual([missing])
  })
})

const labeled = (login: string, name = OVERRIDE_LABEL): IssueEvent => ({
  event: 'labeled',
  actor: { login },
  label: { name },
})
const unlabeled = (login: string): IssueEvent => ({
  event: 'unlabeled',
  actor: { login },
  label: { name: OVERRIDE_LABEL },
})

describe('the db-breaking-approved override', () => {
  it('is the label and approver ADR 0019 names', () => {
    expect(OVERRIDE_LABEL).toBe('db-breaking-approved')
    expect(OVERRIDE_APPROVER).toBe('rservant')
  })

  it('the label applied by rservant passes', () => {
    expect(
      verifyOverride([OVERRIDE_LABEL], [labeled('rservant')]).approved
    ).toBe(true)
  })

  it('the label applied by another user fails', () => {
    const r = verifyOverride([OVERRIDE_LABEL], [labeled('someone-else')])
    expect(r.approved).toBe(false)
    expect(r.reason).toContain('someone-else')
  })

  it('the label removed fails', () => {
    expect(
      verifyOverride([], [labeled('rservant'), unlabeled('rservant')]).approved
    ).toBe(false)
  })

  it('removed and re-added by someone else fails', () => {
    expect(
      verifyOverride(
        [OVERRIDE_LABEL],
        [labeled('rservant'), unlabeled('x'), labeled('someone-else')]
      ).approved
    ).toBe(false)
  })

  it('the latest labeling decides: re-added by rservant passes', () => {
    expect(
      verifyOverride(
        [OVERRIDE_LABEL],
        [labeled('someone-else'), unlabeled('x'), labeled('rservant')]
      ).approved
    ).toBe(true)
  })

  it('present with no labeling event fails', () => {
    expect(
      verifyOverride([OVERRIDE_LABEL], [labeled('rservant', 'other-label')])
        .approved
    ).toBe(false)
  })

  it('reads the live labels and every events page', async () => {
    const calls: string[] = []
    const r = await fetchOverride(
      async path => {
        calls.push(path)
        return path.includes('/labels')
          ? [{ name: OVERRIDE_LABEL }]
          : [labeled('rservant')]
      },
      'taverns-red/toast-stats',
      7
    )
    expect(r.approved).toBe(true)
    expect(calls).toEqual([
      'repos/taverns-red/toast-stats/issues/7/labels',
      'repos/taverns-red/toast-stats/issues/7/events',
    ])
  })

  it('an API error fails', async () => {
    const r = await fetchOverride(
      async () => {
        throw new Error('HTTP 502')
      },
      'taverns-red/toast-stats',
      7
    )
    expect(r.approved).toBe(false)
    expect(r.reason).toContain('HTTP 502')
  })

  it('a malformed API response fails', async () => {
    const r = await fetchOverride(
      async () => [{ unexpected: true }],
      'taverns-red/toast-stats',
      7
    )
    expect(r.approved).toBe(false)
  })
})

describe('decide', () => {
  const breaking: Finding[] = [
    { direction: 'backward', reader: 'Thing', kind: 'rejected', detail: 'x' },
  ]

  it('nothing breaking passes without consulting the override', () => {
    expect(decide({ breaking: [], override: null }).pass).toBe(true)
  })

  it('a breaking change with no verified override fails', () => {
    expect(decide({ breaking, override: null }).pass).toBe(false)
    expect(
      decide({ breaking, override: { approved: false, reason: 'no' } }).pass
    ).toBe(false)
  })

  it('a breaking change with the verified override passes', () => {
    expect(
      decide({ breaking, override: { approved: true, reason: 'ok' } }).pass
    ).toBe(true)
  })
})

describe('the real reader schemas and fixtures', () => {
  const head = readerSchemasOf(contracts as Record<string, unknown>)

  it('finds every *ReaderSchema export', () => {
    expect(Object.keys(head).length).toBeGreaterThanOrEqual(11)
    expect(head).toHaveProperty('PerDistrictData')
  })

  it('every reader schema has exactly one fixture', () => {
    expect(COMPAT_FIXTURES.map(s => s.reader).sort()).toEqual(
      Object.keys(head).sort()
    )
  })

  it('each fixture is what the writer contract accepts, strictly', async () => {
    const fixtures = await loadFixtures(COMPAT_FIXTURES, repoRoot)
    for (const spec of COMPAT_FIXTURES) {
      const fx = fixtures[spec.reader]
      expect(fx, spec.reader).toMatchObject({ ok: true })
      const writer = (contracts as Record<string, unknown>)[
        `${spec.reader}Schema`
      ] as z.ZodType
      const r = writer.safeParse((fx as { payload: unknown }).payload)
      expect(r.error?.issues, spec.reader).toBeUndefined()
    }
  })

  it('the PR head is compatible with itself', async () => {
    const fixtures = await loadFixtures(COMPAT_FIXTURES, repoRoot)
    expect(
      compareCompat({
        base: { schemas: head, fixtures },
        head: { schemas: head, fixtures },
      })
    ).toEqual([])
  })

  it('a fixture missing from the tree loads as a failure', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'compat-'))
    try {
      const fixtures = await loadFixtures(COMPAT_FIXTURES, empty)
      for (const spec of COMPAT_FIXTURES) {
        expect(fixtures[spec.reader]).toMatchObject({ ok: false })
      }
    } finally {
      rmSync(empty, { recursive: true, force: true })
    }
  })
})
