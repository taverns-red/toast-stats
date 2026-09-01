/**
 * Type sentinel — proves the `SnapshotDate` brand actually REJECTS the #1315
 * bug class at compile time (#1323, epic #1319).
 *
 * Why a compiler-API sentinel instead of the two obvious guards? Both are inert
 * here, and inertness is invisible (Lesson 82 — assert behaviour, not
 * declaration):
 *
 *   1. `@ts-expect-error` in a normal type-test file asserts NOTHING, because
 *      `tsconfig.json` excludes `src/**\/__tests__/**\/*` and `src/**\/*.test.ts`
 *      from the program — `npm run typecheck` never reads this directory.
 *   2. A `*.test-d.ts` + `vitest --typecheck` file matches NEITHER vitest
 *      project's include (the `unit` project inherits the default
 *      `**\/*.{test,spec}.?(c|m)[jt]s?(x)`, which does not match `.test-d.ts`),
 *      so it would silently run in no project at all — the R20/#482 partition
 *      hazard.
 *
 * So instead we compile known-bad snippets through the project's REAL
 * `tsconfig.json` and assert the specific diagnostic fires. This is the direct
 * analogue of the ESLint sentinel in `src/__tests__/lint/set-state-in-effect.test.ts`,
 * which lints a known-bad snippet at a virtual `src/__sentinel__/…` path — same
 * virtual-path trick, same discipline.
 *
 * Every negative case is paired with a POSITIVE CONTROL (a minted date compiles
 * clean). Without it a sentinel can false-pass on an unrelated compile error —
 * "an error fired" is not the same claim as "the brand fired".
 *
 * Driven through the `tsc` BINARY rather than the JS compiler API (#1489):
 * TypeScript 7 is the native port, and its npm package no longer exports the
 * old `ts.sys` / `ts.createProgram` surface at all (`typescript`'s "." export
 * is now just `lib/version.cjs`; the compiler is reachable only via the `tsc`
 * binary or an `unstable/*` LSP-style API). Shelling out is also the stronger
 * claim: it is the same compiler, same tsconfig, and same invocation shape the
 * `typecheck` gate uses, rather than a hand-built in-memory program that could
 * drift from it.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Resolve the frontend workspace root from this file's own location so the test
// is cwd-independent (root `npm run test` launches from the repo root; the
// workspace run launches from frontend/).
const frontendDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..'
)

/** One diagnostic as the `tsc` CLI reports it, folded back into the shape the
 *  assertions below want. */
interface SentinelDiagnostic {
  readonly code: number
  readonly message: string
}

const MINT = `import { toSnapshotDate } from '../types/snapshotDate'
const minted = toSnapshotDate('2026-06-30')!
`

/**
 * A minted snapshot date flows into every per-snapshot entry point cleanly.
 * If this control ever goes red the negative cases below are meaningless —
 * they would be "passing" on some unrelated compile error.
 */
const POSITIVE_CONTROL = `${MINT}
import {
  fetchCdnRankingsForDate,
  fetchCdnCompetitiveAwards,
  cdnAnalyticsUrl,
  cdnSnapshotUrl,
  cdnDistrictReportsUrl,
  fetchCdnDistrictSnapshot,
  fetchCdnDistrictAnalytics,
} from '../services/cdn'

export async function allSevenEntryPointsAcceptAMintedDate() {
  await fetchCdnRankingsForDate(minted)
  await fetchCdnCompetitiveAwards(minted)
  cdnAnalyticsUrl(minted, '61', 'analytics')
  cdnSnapshotUrl(minted, '61')
  cdnDistrictReportsUrl(minted, '61')
  await fetchCdnDistrictSnapshot<unknown>(minted, '61')
  await fetchCdnDistrictAnalytics<unknown>(minted, '61', 'analytics')
}
`

/**
 * The #1315 bug verbatim: the rankings payload's as-of date (which advances
 * past the pinned snapshot during month-end closing) keyed into a per-snapshot
 * fetch. This is the single case the whole epic exists to make unrepresentable.
 */
const AS_OF_DATE_INTO_AWARDS_FETCH = `${MINT}
import { fetchCdnRankingsForDate, fetchCdnCompetitiveAwards } from '../services/cdn'

export async function theBugFromIssue1315() {
  const data = await fetchCdnRankingsForDate(minted)
  // data.asOfDate is metadata.sourceCsvDate — NOT the snapshot key.
  await fetchCdnCompetitiveAwards(data.asOfDate)
}
`

/** An unvalidated raw string — the shape every laundering path collapses to. */
const RAW_STRING_INTO_AWARDS_FETCH = `import { fetchCdnCompetitiveAwards } from '../services/cdn'

export async function rawStringIsNotASnapshotDate(date: string) {
  await fetchCdnCompetitiveAwards(date)
}
`

/** Even a correctly-shaped literal must not be trusted — it bypassed the mint. */
const RAW_LITERAL_INTO_ANALYTICS_URL = `import { cdnAnalyticsUrl } from '../services/cdn'

export function aWellShapedLiteralStillBypassesTheMint() {
  return cdnAnalyticsUrl('2026-06-30', '61', 'analytics')
}
`

/**
 * A synthesized program-year boundary (`${year + 1}-06-30`) is a calendar
 * bound, not a snapshot that exists — the F3 laundering shape.
 */
const PROGRAM_YEAR_END_DATE_INTO_FETCH = `import { getProgramYear } from '../utils/programYear'
import { fetchCdnCompetitiveAwards } from '../services/cdn'

export async function aSynthesizedPyBoundIsNotASnapshot() {
  await fetchCdnCompetitiveAwards(getProgramYear(2025).endDate)
}
`

/** Today's wall-clock date is never a snapshot date — the F1 laundering shape. */
const WALL_CLOCK_INTO_FETCH = `import { fetchCdnCompetitiveAwards } from '../services/cdn'

export async function todayIsNotASnapshot() {
  await fetchCdnCompetitiveAwards(new Date().toISOString().split('T')[0]!)
}
`

const SENTINELS: Record<string, string> = {
  'positiveControl.ts': POSITIVE_CONTROL,
  'asOfDateIntoAwardsFetch.ts': AS_OF_DATE_INTO_AWARDS_FETCH,
  'rawStringIntoAwardsFetch.ts': RAW_STRING_INTO_AWARDS_FETCH,
  'rawLiteralIntoAnalyticsUrl.ts': RAW_LITERAL_INTO_ANALYTICS_URL,
  'programYearEndDateIntoFetch.ts': PROGRAM_YEAR_END_DATE_INTO_FETCH,
  'wallClockIntoFetch.ts': WALL_CLOCK_INTO_FETCH,
}

/** TS2345: Argument of type 'X' is not assignable to parameter of type 'Y'. */
const ARGUMENT_NOT_ASSIGNABLE = 2345

/** `src/foo.ts(12,34): error TS2345: message` */
const DIAGNOSTIC_LINE = /^(.+?)\((\d+),(\d+)\): error TS(\d+): (.*)$/

/** Where the tsc binary lives — workspace first, hoisted root as fallback. */
function resolveTscBin(): string {
  const candidates = [
    path.join(frontendDir, 'node_modules/.bin/tsc'),
    path.join(frontendDir, '../node_modules/.bin/tsc'),
  ]
  const found = candidates.find(c => fs.existsSync(c))
  if (!found)
    throw new Error(
      `tsc binary not found; looked in:\n${candidates.join('\n')}`
    )
  return found
}

let diagnosticsByFile: Map<string, readonly SentinelDiagnostic[]>
let sentinelDir: string | undefined
let sentinelConfig: string | undefined

/**
 * One `tsc` run over every sentinel at once — the lib/node_modules type graph
 * is loaded once rather than per-case, which is the whole cost here.
 *
 * The sentinels are written into a real, uniquely-named directory under `src/`
 * (so `../types/snapshotDate` resolves to the real module, and tsconfig's
 * `"include": ["src"]` picks them up with no include surgery), compiled through
 * a throwaway config that only relaxes the rules a deliberately dead file would
 * trip, and deleted again in afterAll.
 */
function compileSentinels(): Map<string, readonly SentinelDiagnostic[]> {
  sentinelDir = fs.mkdtempSync(path.join(frontendDir, 'src', '__sentinel__'))
  sentinelConfig = path.join(
    frontendDir,
    `tsconfig.sentinel.${path.basename(sentinelDir)}.json`
  )

  for (const [name, source] of Object.entries(SENTINELS)) {
    fs.writeFileSync(path.join(sentinelDir, name), source, 'utf8')
  }

  fs.writeFileSync(
    sentinelConfig,
    JSON.stringify({
      extends: './tsconfig.json',
      compilerOptions: {
        noEmit: true,
        skipLibCheck: true,
        // The sentinels are deliberately un-referenced by the real program.
        noUnusedLocals: false,
        noUnusedParameters: false,
      },
    }),
    'utf8'
  )

  // tsc exits non-zero whenever it reports an error, which is the expected
  // outcome here — the diagnostics are the payload, so read them off either way.
  let output: string
  try {
    output = execFileSync(
      resolveTscBin(),
      ['-p', path.basename(sentinelConfig), '--pretty', 'false'],
      { cwd: frontendDir, encoding: 'utf8', stdio: 'pipe' }
    )
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string }
    output = e.stdout ?? ''
    if (!output.trim()) {
      throw new Error(
        `tsc produced no diagnostics but failed:\n${e.stderr ?? e.message ?? ''}`,
        { cause: err }
      )
    }
  }

  const byFile = new Map<string, SentinelDiagnostic[]>(
    Object.keys(SENTINELS).map(name => [name, []])
  )

  // Continuation lines ("  Type 'string' is not assignable to …") are indented
  // and belong to the diagnostic above them; fold them in so the elaboration
  // naming the brand is not lost.
  let current: { file: string; parts: string[] } | undefined
  const flush = () => {
    if (!current) return
    const [head, ...rest] = current.parts
    const code = Number(head)
    byFile
      .get(current.file)
      ?.push({ code, message: rest.join(' ').replace(/\s+/g, ' ').trim() })
    current = undefined
  }

  for (const line of output.split(/\r?\n/)) {
    const match = DIAGNOSTIC_LINE.exec(line)
    if (match) {
      flush()
      const [, file, , , code, message] = match
      const name = path.basename(file ?? '')
      // Diagnostics from the rest of the real program are not this test's
      // business — only the sentinel files are asserted on.
      if (byFile.has(name)) current = { file: name, parts: [code!, message!] }
      continue
    }
    if (current && /^\s+\S/.test(line)) current.parts.push(line.trim())
    else flush()
  }
  flush()

  return byFile
}

const diagnosticsFor = (name: string): readonly SentinelDiagnostic[] => {
  const found = diagnosticsByFile.get(name)
  if (!found) throw new Error(`no diagnostics captured for ${name}`)
  return found
}

const describeDiagnostics = (
  diagnostics: readonly SentinelDiagnostic[]
): string =>
  diagnostics.map(d => `TS${d.code}: ${d.message}`).join('\n') || '(none)'

describe('SnapshotDate brand enforcement (#1323)', () => {
  beforeAll(() => {
    diagnosticsByFile = compileSentinels()
  }, 120000)

  afterAll(() => {
    if (sentinelDir) fs.rmSync(sentinelDir, { recursive: true, force: true })
    if (sentinelConfig) fs.rmSync(sentinelConfig, { force: true })
  })

  it('POSITIVE CONTROL: a minted date is accepted by all seven entry points', () => {
    const diagnostics = diagnosticsFor('positiveControl.ts')
    expect(
      describeDiagnostics(diagnostics),
      'The control must compile clean, or every rejection below is meaningless'
    ).toBe('(none)')
  })

  it.each([
    [
      'the #1315 bug — asOfDate keyed into a per-snapshot fetch',
      'asOfDateIntoAwardsFetch.ts',
    ],
    ['an unvalidated raw string', 'rawStringIntoAwardsFetch.ts'],
    [
      'a well-shaped literal that bypassed the mint',
      'rawLiteralIntoAnalyticsUrl.ts',
    ],
    ['a synthesized program-year end bound', 'programYearEndDateIntoFetch.ts'],
    ["today's wall-clock date", 'wallClockIntoFetch.ts'],
  ])('rejects %s', (_label, name) => {
    const diagnostics = diagnosticsFor(name)
    const brandErrors = diagnostics.filter(
      d => d.code === ARGUMENT_NOT_ASSIGNABLE
    )

    expect(
      brandErrors.length,
      `expected a TS${ARGUMENT_NOT_ASSIGNABLE} brand rejection, got:\n${describeDiagnostics(diagnostics)}`
    ).toBeGreaterThan(0)

    // Assert it is the BRAND rejecting it, not some incidental mismatch.
    expect(brandErrors.map(d => d.message).join('\n')).toContain('SnapshotDate')
  })
})
