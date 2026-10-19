// District-surface breakpoint reconciliation guard (#682, epic #674 Sprint 8)
//
// The redesign HANDOFF (docs/design/club-redesign-2026-05/HANDOFF.md §126/§234)
// defines ONE responsive system for the district pages:
//   - 2-col content grids collapse to 1-col under 980px
//   - tables collapse to cards under 640px (owned by ClubsTable useIsMobile(640))
//
// Before this sprint the district surface mixed 768 / 1024 for its 2-col grids
// and KPI strip. This guard pins every 2-col content grid and the KPI strip's
// desktop threshold to 980px so the system can't drift back. It reads the real
// source (CSS + the two TSX call sites), so it's falsifiable and fast — no
// layout engine needed (jsdom can't compute media queries; cf. Lesson 66).

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const SRC = resolve(__dirname, '../..')
const read = (p: string) => readFileSync(resolve(SRC, p), 'utf-8')

const narrativeCss = read('styles/components/district-narrative.css')
const districtOverview = read('components/DistrictOverview.tsx')

describe('District breakpoint reconciliation (#682)', () => {
  describe('district-narrative.css KPI strip', () => {
    it('uses 980px as the desktop layout threshold; 1024px only for the sticky pin', () => {
      expect(narrativeCss).toContain('min-width: 980px')
      expect(narrativeCss).not.toContain('min-width: 768px')
      // #1828: the strip's sticky pin is gated on 1024 (no sticky element
      // taller than 64px below 1024) — used ONLY for that pin, never for its
      // layout (cards grid, toggle), which stays on 980.
      const at1024 = narrativeCss.match(
        /@media\s*\(min-width:\s*1024px\)\s*\{[\s\S]*?\n {2}\}/g
      )
      expect(at1024).toHaveLength(1)
      const body = at1024?.[0] ?? ''
      expect(body).not.toMatch(/__cards|__toggle|grid-template-columns/)
      expect(body).toMatch(/\.district-kpi-strip\s*\{[^}]*position:\s*sticky/)
    })

    it('makes 2-col (2×2) the mobile base, no 640px intermediate (#866)', () => {
      // #866 collapsed the old 1-col mobile base into 2×2 (mobile-ux-audit
      // §Epic B Sprint 1), so the strip now steps base-2-col → 4-col (980).
      // The former `min-width: 640px` intermediate is gone — the base already
      // delivers 2 columns, so the query was redundant. Desktop threshold (980)
      // is unchanged (asserted above).
      expect(narrativeCss).not.toContain('min-width: 640px')
      expect(narrativeCss).toMatch(
        /\.district-kpi-strip__cards\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/
      )
    })
  })

  describe('DistrictOverview composition grid', () => {
    it('collapses the 2-col content grid at 980px, not Tailwind lg (1024)', () => {
      expect(districtOverview).toContain('min-[980px]:grid-cols-2')
      expect(districtOverview).not.toContain('lg:grid-cols-2')
    })
  })
})
