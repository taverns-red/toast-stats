/**
 * The content gate reads the education rollup (#2222, ADR-015 step 9
 * follow-up): `derived/education-rollup/<PY>.json` and its `index.json`.
 *
 * Until #2222 the rollup reached prod through mirror-education-rollup.sh,
 * outside every gate. It now goes through the report-sidecar manifest, so
 * the gate reads every rollup object in it: the shared-contracts schema the
 * frontend reads it by, the program year its path names, and an index whose
 * every row points at that year's own object.
 *
 * The fixtures are real prod objects (2026-10-21; asOf 2026-10-20), cut to
 * two districts, one region and two program years: recorded, not invented.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import * as path from 'node:path'
import {
  checkObject,
  classifyObject,
  planManifestChecks,
  type CheckContext,
  type ObjectKind,
  type StoredObject,
} from '../promotionContentGate.js'

const DIR = path.join(
  process.cwd(),
  'scripts/lib/__tests__/fixtures/education-rollup-prod'
)
const recorded = (f: string): Record<string, unknown> =>
  JSON.parse(readFileSync(path.join(DIR, f), 'utf-8')) as Record<
    string,
    unknown
  >

const PY_PATH = 'derived/education-rollup/2026-2027.json'
const INDEX_PATH = 'derived/education-rollup/index.json'
const ctx: CheckContext = {
  latestSnapshotDate: null,
  availableDates: [],
  clubHistoryShards: { staging: [], prod: [] },
}
// Built and uploaded plain (no -Z), as build-education-rollup.sh does.
const stored = (value: unknown): StoredObject => ({
  bytes: new Uint8Array(Buffer.from(JSON.stringify(value))),
})
const check = (kind: ObjectKind, value: unknown, p: string) =>
  checkObject({ path: p, kind }, stored(value), null, ctx)
const checkYear = (value: unknown, p = PY_PATH) =>
  check('education-rollup-program-year', value, p)
const checkIndex = (value: unknown) =>
  check('education-rollup-index', value, INDEX_PATH)

describe('classifyObject — education rollup (#2222)', () => {
  it('a program-year file and the index have their own kinds', () => {
    expect(classifyObject(PY_PATH)).toBe('education-rollup-program-year')
    expect(classifyObject('derived/education-rollup/2003-2004.json')).toBe(
      'education-rollup-program-year'
    )
    expect(classifyObject(INDEX_PATH)).toBe('education-rollup-index')
  })

  it('anything else under derived/ is plain json', () => {
    expect(classifyObject('derived/education-rollup/scratch.json')).toBe('json')
  })
})

describe('checkObject — education-rollup-program-year (#2222)', () => {
  it('passes the recorded prod year', () => {
    expect(checkYear(recorded('2026-2027.json'))).toBeNull()
  })

  it('holds a year that fails the schema the frontend reads it by', () => {
    const v = recorded('2026-2027.json')
    delete v.world
    expect(checkYear(v)).toMatch(/schema validation failed/)
    const w = { ...recorded('2026-2027.json'), clubs: [] }
    expect(checkYear(w)).toMatch(/schema validation failed/)
  })

  it('holds a year served under another program year’s path', () => {
    expect(
      checkYear(
        recorded('2026-2027.json'),
        'derived/education-rollup/2025-2026.json'
      )
    ).toMatch(/programYear is "2026-2027", but its path names 2025-2026/)
  })
})

describe('checkObject — education-rollup-index (#2222)', () => {
  it('passes the recorded prod index', () => {
    expect(checkIndex(recorded('index.json'))).toBeNull()
  })

  it('holds an index that fails the schema', () => {
    const v = recorded('index.json')
    delete v.trend
    expect(checkIndex(v)).toMatch(/schema validation failed/)
  })

  it('holds an index row pointing anywhere but its own year’s object', () => {
    const v = recorded('index.json')
    const rows = v.programYears as Array<Record<string, unknown>>
    rows[0]!.path = 'v1/dates.json'
    expect(checkIndex(v)).toMatch(
      /programYears\[0\] \(2025-2026\) points at "v1\/dates.json", not "derived\/education-rollup\/2025-2026.json"/
    )
  })

  it('holds an index naming a program year twice', () => {
    const v = recorded('index.json')
    const rows = v.programYears as unknown[]
    rows.push(rows[0])
    expect(checkIndex(v)).toMatch(/names 2025-2026 twice/)
  })
})

describe('planning — every rollup object a manifest lists is read (#2222)', () => {
  it('with its hash', () => {
    const e = (p: string) => ({
      path: p,
      sha256: 'a'.repeat(64),
      date: null,
      stage: 'education-rollup',
    })
    const plan = planManifestChecks([e(PY_PATH), e(INDEX_PATH)], [])
    expect(plan.manifestCount).toBe(2)
    expect(plan.checks).toEqual([
      {
        path: PY_PATH,
        kind: 'education-rollup-program-year',
        expectedSha256: 'a'.repeat(64),
      },
      {
        path: INDEX_PATH,
        kind: 'education-rollup-index',
        expectedSha256: 'a'.repeat(64),
      },
    ])
  })
})
