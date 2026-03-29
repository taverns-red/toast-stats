import { render } from '@testing-library/react'
import { axe, toHaveNoViolations } from 'jest-axe'
import { expect, it, describe, vi } from 'vitest'
import LandingPage from '../LandingPage'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ProgramYearProvider } from '../../contexts/ProgramYearContext'

expect.extend(toHaveNoViolations)

const queryClient = new QueryClient()

// Mock localStorage
Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
  writable: true,
})

describe('LandingPage Accessibility', () => {
  it('should have no accessibility violations', async () => {
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <ProgramYearProvider>
          <MemoryRouter>
            <LandingPage />
          </MemoryRouter>
        </ProgramYearProvider>
      </QueryClientProvider>
    )
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
