/**
 * Division group summary gets a real accessible name (#2676, spec §3.3, HUB-30).
 *
 * The phone list's group summary is "✗ 10 · ⚠ 5": glyphs a screen reader reads
 * as symbols. A group may now carry an `accessibleName`
 * ("Division A, 18 clubs, 10 need intervention, 5 vulnerable"), which names the
 * toggle button. Falsifiable on main, where the toggle is named by its text.
 */

import { describe, it, expect, afterEach } from 'vitest'
import { render as rtlRender, cleanup, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '@testing-library/jest-dom'
import { MobileRowList, type MobileRowGroup } from '../MobileRowList'

const rows = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `r${i}`,
    to: `/club/${i}`,
    title: `Club ${i}`,
  }))

describe('MobileRowList group accessible name (#2676)', () => {
  afterEach(() => cleanup())

  it('names the group toggle with the supplied accessibleName', () => {
    // Built outside the array literal so the new field is not an excess-
    // property error before the prop exists (red) and stays valid after.
    const group = {
      id: 'a',
      label: 'Division A',
      rows: rows(18),
      summary: '✗ 10 · ⚠ 5',
      accessibleName:
        'Division A, 18 clubs, 10 need intervention, 5 vulnerable',
    }
    const groups: MobileRowGroup[] = [group]
    rtlRender(<MobileRowList label="Clubs" groups={groups} noun="clubs" />, {
      wrapper: MemoryRouter,
    })
    expect(
      screen.getByRole('button', {
        name: 'Division A, 18 clubs, 10 need intervention, 5 vulnerable',
      })
    ).toBeInTheDocument()
  })
})
