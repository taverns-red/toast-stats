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
 */

import { describe, it, expect, beforeAll } from 'vitest'
import ts from 'typescript'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Resolve the frontend workspace root from this file's own location so the test
// is cwd-independent (root `npm run test` launches from the repo root; the
// workspace run launches from frontend/).
const frontendDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..'
)

/** Virtual directory — these paths never exist on disk. Imports resolve
 *  relative to them, so `../types/snapshotDate` hits the real module. */
const SENTINEL_DIR = path.join(frontendDir, 'src/__sentinel__')

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

const virtualPath = (name: string) => path.join(SENTINEL_DIR, name)

let diagnosticsByFile: Map<string, readonly ts.Diagnostic[]>

/**
 * One program over every sentinel at once — the lib/node_modules type graph is
 * loaded once rather than per-case, which is the whole cost here.
 */
function compileSentinels(): Map<string, readonly ts.Diagnostic[]> {
  const configPath = path.join(frontendDir, 'tsconfig.json')
  const { config, error } = ts.readConfigFile(configPath, ts.sys.readFile)
  if (error)
    throw new Error(ts.flattenDiagnosticMessageText(error.messageText, '\n'))

  const parsed = ts.parseJsonConfigFileContent(config, ts.sys, frontendDir)
  const options: ts.CompilerOptions = {
    ...parsed.options,
    noEmit: true,
    skipLibCheck: true,
    // The sentinels are deliberately un-referenced by the real program.
    noUnusedLocals: false,
    noUnusedParameters: false,
  }

  const sources = new Map(
    Object.entries(SENTINELS).map(([name, source]) => [
      virtualPath(name),
      source,
    ])
  )
  // Only getSourceFile needs overriding: the sentinels are program rootNames and
  // never import each other, so the host is never asked to resolve or stat them.
  const host = ts.createCompilerHost(options, true)
  const realGetSourceFile = host.getSourceFile.bind(host)

  host.getSourceFile = (fileName, languageVersion, onError, shouldCreate) => {
    const source = sources.get(path.resolve(fileName))
    return source === undefined
      ? realGetSourceFile(fileName, languageVersion, onError, shouldCreate)
      : ts.createSourceFile(
          fileName,
          source,
          languageVersion,
          true,
          ts.ScriptKind.TS
        )
  }

  const program = ts.createProgram([...sources.keys()], options, host)

  return new Map(
    [...sources.keys()].map(filePath => {
      const sourceFile = program.getSourceFile(filePath)
      if (!sourceFile) throw new Error(`sentinel not in program: ${filePath}`)
      return [
        filePath,
        [
          ...program.getSyntacticDiagnostics(sourceFile),
          ...program.getSemanticDiagnostics(sourceFile),
        ],
      ]
    })
  )
}

const diagnosticsFor = (name: string): readonly ts.Diagnostic[] => {
  const found = diagnosticsByFile.get(virtualPath(name))
  if (!found) throw new Error(`no diagnostics captured for ${name}`)
  return found
}

const describeDiagnostics = (diagnostics: readonly ts.Diagnostic[]): string =>
  diagnostics
    .map(
      d => `TS${d.code}: ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`
    )
    .join('\n') || '(none)'

describe('SnapshotDate brand enforcement (#1323)', () => {
  beforeAll(() => {
    diagnosticsByFile = compileSentinels()
  }, 120000)

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
    expect(
      brandErrors
        .map(d => ts.flattenDiagnosticMessageText(d.messageText, ' '))
        .join('\n')
    ).toContain('SnapshotDate')
  })
})
