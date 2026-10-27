/* Club page → Methodology "Member-level data" link (#2302). The club page
 * is where officers look for member data, so its footer points to the
 * section that says why it isn't here. */

import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ClubMemberDataNote from '../ClubMemberDataNote'

describe('ClubMemberDataNote (#2302)', () => {
  it('links to the Methodology member-level data section', () => {
    render(
      <MemoryRouter>
        <ClubMemberDataNote />
      </MemoryRouter>
    )
    expect(
      screen.getByRole('link', { name: /member-level data/i })
    ).toHaveAttribute('href', '/methodology#member-data')
  })
})
