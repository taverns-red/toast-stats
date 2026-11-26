/**
 * RollupPageShell: the h1 names the page (#2756), while `title` stays the
 * region scope that the context bar and the section nav use.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { RollupPageShell } from '../RollupPageShell'

vi.mock('../../../hooks/useIsMobile', () => ({ useIsMobile: () => false }))

afterEach(cleanup)

const renderShell = (heading?: string) =>
  render(
    <MemoryRouter initialEntries={['/region/05/education']}>
      <RollupPageShell
        title="Region 05"
        {...(heading ? { heading } : {})}
        eyebrow="Toastmasters Region 05 · Education"
        lede="Education awards across the region."
        trail={[{ label: 'Regions', to: '/regions' }]}
        subnavBase="/region/05"
      >
        <p>body</p>
      </RollupPageShell>
    </MemoryRouter>
  )

describe('RollupPageShell', () => {
  it('puts the heading in the h1 and keeps the title for the section nav', () => {
    renderShell('Region 05 education')
    expect(
      screen.getByRole('heading', { level: 1, name: 'Region 05 education' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('navigation', { name: 'Region 05 sections' })
    ).toBeInTheDocument()
  })

  it('falls back to the title when no heading is given', () => {
    renderShell()
    expect(
      screen.getByRole('heading', { level: 1, name: 'Region 05' })
    ).toBeInTheDocument()
  })
})
