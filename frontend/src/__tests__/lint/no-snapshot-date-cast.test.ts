/**
 * Lint sentinel — proves the `as SnapshotDate` cast ban actually fires
 * (#1323, epic #1319).
 *
 * The brand is only as strong as the ban on minting it by hand: `raw as
 * SnapshotDate` re-admits the entire #1315 bug class in five characters, and a
 * type-level guard cannot see it (a cast is, by definition, the escape hatch).
 * The ESLint rule is the backstop for that bypass — the same factory-plus-guard
 * pairing as L166 (`toSnapshotDate` is the blessed mint; this is the bypass
 * catcher).
 *
 * Per Lesson 82 this lints a known-bad snippet through the project's REAL
 * config and asserts the rule FIRES. A `calculateConfigForFile` severity
 * assertion would pass against a rule that is configured but matching nothing —
 * and an AST selector that silently stops matching (a `no-restricted-syntax`
 * selector is a string; nothing typechecks it against the ESTree shape) is
 * exactly that failure mode.
 */

import { describe, it, expect } from 'vitest'
import { ESLint } from 'eslint'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const frontendDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..'
)

const RULE = 'no-restricted-syntax'

const AS_CAST = `import type { SnapshotDate } from '../types/snapshotDate'

export function launderTheBrand(raw: string): SnapshotDate {
  return raw as SnapshotDate
}
`

const ANGLE_BRACKET_CAST = `import type { SnapshotDate } from '../types/snapshotDate'

export function launderTheBrandTheOldWay(raw: string) {
  return <SnapshotDate>raw
}
`

/** The as-of date laundered through a cast — #1315 re-admitted verbatim. */
const AS_CAST_ON_AS_OF_DATE = `import type { SnapshotDate } from '../types/snapshotDate'

export function launderTheAsOfDate(data: { asOfDate: string }) {
  return data.asOfDate as SnapshotDate
}
`

/** Casting to an unrelated type must stay legal — the rule must be narrow. */
const UNRELATED_CAST = `export function castToSomethingElse(raw: unknown): string {
  return raw as string
}
`

const lintAt = async (source: string, relativePath: string) => {
  const eslint = new ESLint({ cwd: frontendDir })
  const [result] = await eslint.lintText(source, {
    filePath: path.join(frontendDir, relativePath),
  })
  return (result?.messages ?? []).filter(
    m => m.ruleId === RULE && m.severity === 2
  )
}

describe('as-SnapshotDate cast ban (#1323)', () => {
  it.each([
    ['an `as SnapshotDate` cast', AS_CAST],
    ['an angle-bracket `<SnapshotDate>` cast', ANGLE_BRACKET_CAST],
    ['a cast that launders an as-of date', AS_CAST_ON_AS_OF_DATE],
  ])(
    'flags %s outside the mint module',
    async (_label, source) => {
      const errors = await lintAt(source, 'src/__sentinel__/launder.ts')

      expect(
        errors.length,
        'the cast ban did not fire — the brand is bypassable'
      ).toBeGreaterThan(0)
      expect(errors[0]?.message).toMatch(/snapshotDate|toSnapshotDate|mint/i)
    },
    20000
  )

  it('does NOT flag a cast to an unrelated type', async () => {
    const errors = await lintAt(UNRELATED_CAST, 'src/__sentinel__/unrelated.ts')
    expect(errors).toEqual([])
  }, 20000)

  it('does NOT flag the mint module itself — it is where the brand is created', async () => {
    const errors = await lintAt(AS_CAST, 'src/types/snapshotDate.ts')
    expect(
      errors,
      'the mint module must be exempt, or the brand cannot be created at all'
    ).toEqual([])
  }, 20000)
})
