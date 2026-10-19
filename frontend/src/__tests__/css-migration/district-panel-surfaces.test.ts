// District analytics panel-surface guard (#682, epic #674 Sprint 8)
//
// The district pages theme dark mode via the manual `[data-theme='dark']`
// toggle, NOT `prefers-color-scheme`. Tailwind `dark:` variants are therefore
// INERT here (the project registers `@custom-variant theme-dark`, not `dark`;
// Lessons 73 / 95). A panel styled with `bg-white dark:bg-gray-800` renders
// `bg-white` in dark — which the dark-mode.css override routes to
// `--surface-card` (#1A1722), a LIGHTER surface than the neighbour
// `.redesign-panel`'s `--surface` (#111922). Result: the Education Levels
// panel read lighter than its neighbours in dark. (The Achievement Highlights
// panel it was paired with was deleted with the Analytics page, #2159.)
//
// Fix: drive both panels from the token-driven `.redesign-panel` primitive
// (matches every neighbour), and give the nested stat cards a `--surface-2`
// arbitrary-value background that re-resolves live under the dark toggle
// (Lesson 093). This guard pins that so the legacy patterns can't return.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const SRC = resolve(__dirname, '../..')
const read = (p: string) => readFileSync(resolve(SRC, p), 'utf-8')

const educationCard = read('components/EducationLevelsCard.tsx')

describe('District panel dark-mode surfaces (#682)', () => {
  describe('EducationLevelsCard', () => {
    it('is a token-driven redesign-panel, not a bg-white card', () => {
      expect(educationCard).toContain('redesign-panel')
      expect(educationCard).not.toContain('bg-white')
    })

    it('drops the inert dark: panel utilities', () => {
      // `dark:bg-gray-800` / `dark:border-gray-700` never fire under the
      // manual toggle — they are dead selectors, not a dark-mode fix.
      expect(educationCard).not.toContain('dark:bg-gray-800')
      expect(educationCard).not.toContain('dark:border-gray-700')
    })
  })
})
