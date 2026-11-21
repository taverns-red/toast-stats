import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { DistrictSectionIntro } from '../DistrictSectionIntro'

afterEach(() => cleanup())

const renderIntro = (segment: string) =>
  render(
    <MemoryRouter>
      <DistrictSectionIntro districtName="District 61" segment={segment} />
    </MemoryRouter>
  )

describe('DistrictSectionIntro link to the section video (#2658)', () => {
  it('links What Changed to its video card', () => {
    renderIntro('changes')
    expect(
      screen.getByRole('link', { name: 'Watch how (30s)' })
    ).toHaveAttribute('href', '/videos#video-v8')
  })

  it('adds no link on Council, which has no video', () => {
    renderIntro('council')
    expect(screen.queryByRole('link', { name: /watch how/i })).toBeNull()
  })
})
