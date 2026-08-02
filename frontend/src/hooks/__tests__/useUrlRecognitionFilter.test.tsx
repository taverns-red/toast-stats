/**
 * `useUrlRecognitionFilter` (#1362) — the ?awards= / ?tier= codec against a
 * real router.
 *
 * The load-bearing case is **atomicity**. The obvious implementation is two
 * `useUrlState` hooks, one per param; it passes every single-facet test and
 * then loses a facet the moment a handler writes both, because react-router
 * resolves a functional updater against the CURRENT render's params rather
 * than a pending update. The "writes both facets in one update" test below is
 * the one that fails on that implementation.
 */
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { useUrlRecognitionFilter } from '../useUrlRecognitionFilter'
import type { RecognitionFilterState } from '../../components/recognition/recognitionFilter'

const Harness: React.FC<{ next: RecognitionFilterState }> = ({ next }) => {
  const [filter, setFilter] = useUrlRecognitionFilter()
  const location = useLocation()
  return (
    <div>
      <span data-testid="awards">{filter.awards.join('|')}</span>
      <span data-testid="tier">{filter.tier ?? ''}</span>
      <span data-testid="search">{location.search}</span>
      <button type="button" onClick={() => setFilter(next)}>
        apply
      </button>
    </div>
  )
}

const renderAt = (entry: string, next: RecognitionFilterState) =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Harness next={next} />
    </MemoryRouter>
  )

const empty: RecognitionFilterState = { awards: [], tier: null }
const params = () =>
  new URLSearchParams(screen.getByTestId('search').textContent ?? '')

describe('useUrlRecognitionFilter — reading the URL', () => {
  it('parses both facets out of the query string', () => {
    renderAt('/?awards=extension,retention&tier=select', empty)
    expect(screen.getByTestId('awards')).toHaveTextContent(
      'extension|retention'
    )
    expect(screen.getByTestId('tier')).toHaveTextContent('Select')
  })

  it('reads an absent or unrecognised param as no selection', () => {
    renderAt('/?awards=banana&tier=platinum', empty)
    expect(screen.getByTestId('awards')).toHaveTextContent('')
    expect(screen.getByTestId('tier')).toHaveTextContent('')
  })
})

describe('useUrlRecognitionFilter — writing the URL', () => {
  it('writes BOTH facets in one update — neither clobbers the other', () => {
    renderAt('/', { awards: ['extension'], tier: 'Select' })
    fireEvent.click(screen.getByRole('button', { name: 'apply' }))
    expect(params().get('awards')).toBe('extension')
    expect(params().get('tier')).toBe('select')
  })

  it('drops empty facets from the URL rather than leaving blank params', () => {
    renderAt('/?awards=extension&tier=select', empty)
    fireEvent.click(screen.getByRole('button', { name: 'apply' }))
    expect(params().get('awards')).toBeNull()
    expect(params().get('tier')).toBeNull()
  })

  it('preserves unrelated params', () => {
    renderAt('/?regions=01,02&q=toronto', {
      awards: ['retention'],
      tier: null,
    })
    fireEvent.click(screen.getByRole('button', { name: 'apply' }))
    expect(params().get('regions')).toBe('01,02')
    expect(params().get('q')).toBe('toronto')
    expect(params().get('awards')).toBe('retention')
  })
})
