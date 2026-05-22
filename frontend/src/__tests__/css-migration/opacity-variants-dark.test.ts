// Opacity-variant dark-mode override coverage (#564 Phase 2)
//
// Project rule R10 (`tasks/rules.md`):
//   "Tailwind opacity variants (`text-tm-*-80`) don't inherit CSS variable
//   overrides. Audit on every new brand token."
//
// Every brand opacity-variant utility (`bg-tm-*-N`, `text-tm-*-N`,
// `border-tm-*-N`) and every Tailwind v3 `bg-X/N` utility that is actually
// USED in the component tree must have an explicit `[data-theme='dark']`
// override in `frontend/src/styles/dark-mode.css`. Otherwise the class
// renders with its baked-in light-mode rgba in dark mode and produces the
// contrast bugs catalogued in the parent issue.
//
// The Red->Green driver for Phase 2 of the contrast audit (#564). When a
// future component introduces a new opacity-variant utility, this test
// will fail until a dark-mode override is added.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const FRONTEND_SRC = resolve(__dirname, '../..')
const DARK_MODE_CSS = readFileSync(
  resolve(FRONTEND_SRC, 'styles/dark-mode.css'),
  'utf-8'
)

// Set of opacity-variant utility classes that are currently used in the
// frontend component tree (audited 2026-05-22 for #564 Phase 2). Each must
// have a corresponding `[data-theme='dark'] .<class>` rule in
// `dark-mode.css`. When adding a new opacity-variant utility to any
// component, append it here AND add the override.
const TM_OPACITY_VARIANTS_IN_USE = [
  // bg — loyal-blue
  'bg-tm-loyal-blue-10',
  'bg-tm-loyal-blue-20',
  'bg-tm-loyal-blue-30',
  'bg-tm-loyal-blue-80',
  'bg-tm-loyal-blue-90',
  // bg — cool-gray
  'bg-tm-cool-gray-10',
  'bg-tm-cool-gray-20',
  'bg-tm-cool-gray-30',
  'bg-tm-cool-gray-80',
  // bg — happy-yellow
  'bg-tm-happy-yellow-20',
  'bg-tm-happy-yellow-30',
  'bg-tm-happy-yellow-80',
  // bg — true-maroon
  'bg-tm-true-maroon-10',
  'bg-tm-true-maroon-20',
  'bg-tm-true-maroon-80',
  // text
  'text-tm-loyal-blue-70',
  'text-tm-loyal-blue-80',
  'text-tm-happy-yellow-80',
  // border
  'border-tm-cool-gray-20',
  'border-tm-cool-gray-30',
  'border-tm-loyal-blue-20',
  'border-tm-loyal-blue-30',
  'border-tm-true-maroon-30',
] as const

describe('Opacity-variant dark-mode overrides (#564 Phase 2)', () => {
  describe.each(TM_OPACITY_VARIANTS_IN_USE)(
    'tm-* opacity variant `%s`',
    cls => {
      it("has an explicit [data-theme='dark'] override in dark-mode.css", () => {
        // Escape `.` is not needed inside a character class; the class name
        // contains only `[a-z0-9-]` so a plain substring + boundary check
        // via a regex is sufficient.
        const pattern = new RegExp(
          `\\[data-theme=['"]dark['"]\\]\\s+(?:[^{]*\\s)?\\.${cls}(?![\\w-])`,
          'm'
        )
        expect(DARK_MODE_CSS).toMatch(pattern)
      })
    }
  )

  describe('Tailwind v3 `bg-X/N` opacity utilities used in components', () => {
    // `bg-amber-50/50` is used UNCONDITIONALLY in DCPProjectionsTable.tsx
    // (line ~422). Tailwind compiles this to a baked `rgba(254, 243, 199,
    // 0.5)` value that renders washed-out beige on the dark surface. The
    // project covers this with a wildcard class-attribute selector since
    // the slash is escaped in the compiled selector.
    it('bg-amber-50 wildcard override exists', () => {
      expect(DARK_MODE_CSS).toMatch(
        /\[data-theme=['"]dark['"]\]\s+\[class\*="bg-amber-50\\\\\/"\]/
      )
    })

    // `dark:bg-yellow-900/40`, `dark:bg-blue-900/40`,
    // `dark:hover:bg-gray-800/50` all live behind Tailwind's `dark:`
    // variant. The project's manual `[data-theme='dark']` toggle does NOT
    // currently activate the Tailwind `dark:` variant (no
    // `@custom-variant dark` directive). These utilities therefore render
    // only when the OS preference is dark — under the manual toggle they
    // are inert (no opacity-bake bug to override). Tracked separately as a
    // tooling concern for #564 Phase 4 (regression coverage).
    //
    // This test pins the current behaviour so a future Tailwind dark-
    // variant rewire is a deliberate, reviewed change.
    it('manual dark toggle is NOT wired to Tailwind `dark:` variant', () => {
      const indexCss = readFileSync(resolve(FRONTEND_SRC, 'index.css'), 'utf-8')
      expect(indexCss).not.toMatch(/@custom-variant\s+dark/)
    })
  })
})
