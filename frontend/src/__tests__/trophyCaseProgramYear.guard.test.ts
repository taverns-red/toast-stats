/**
 * `DistinguishedDistrictTrophyCase.programYear` is REQUIRED (#1354).
 *
 * The prop was optional, and omitting it fell back to `PREREQUISITE_KEYS` —
 * every prerequisite TI has ever required. The only production caller always
 * passes a year, so that fallback was unreachable in production; it survived
 * to keep ~19 test render sites green. An accidental default standing in for
 * a deliberate one, and precisely the shape that lets a per-year display rule
 * silently regress to "whatever the legacy shape was".
 *
 * Why a source guard and not a `@ts-expect-error` in the component's own test
 * file: `frontend/tsconfig.json` EXCLUDES `src/**\/__tests__/**`, so nothing
 * typechecks the test tree and such a directive would never be evaluated —
 * it would read as proof while proving nothing. Reading the source is honest
 * about what it can and cannot check, and it is the pattern the other static
 * guards in this directory already use.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Comments explain what was REMOVED, so they must not count as usage. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const component = stripComments(
  readFileSync(
    join(__dirname, '../components/DistinguishedDistrictTrophyCase.tsx'),
    'utf-8'
  )
)
const caller = stripComments(
  readFileSync(join(__dirname, '../pages/DistrictDetailPage.tsx'), 'utf-8')
)

describe('trophy-case programYear is required (#1354)', () => {
  it('declares the prop without `?`', () => {
    expect(component).toMatch(/^\s*programYear:\s*string\s*$/m)
    expect(component).not.toMatch(/^\s*programYear\?:/m)
  })

  it('deletes the five-gate fallback rather than leaving it unreachable', () => {
    // The ternary that chose between the year's required set and every
    // legacy key is gone; the derivation is now unconditional.
    expect(component).not.toMatch(/PREREQUISITE_KEYS/)
    expect(component).toMatch(
      /const visibleKeys\s*=\s*requiredPrerequisitesForProgramYear\(programYear\)/
    )
  })

  it('has the production caller pass a year unconditionally', () => {
    // Previously a conditional spread — `{...(effectiveProgramYear && {…})}` —
    // which is how an "always passed in practice" prop stays optional in
    // the type system.
    expect(caller).not.toMatch(/\.\.\.\(effectiveProgramYear\s*&&/)
    expect(caller).toMatch(/programYear=\{/)
  })
})
