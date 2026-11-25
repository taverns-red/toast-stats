import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import NotFoundPanel from '../NotFoundPanel'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('NotFoundPanel', () => {
  it('does not own the document title', () => {
    vi.useFakeTimers()
    document.title = 'Page-owned title'

    render(
      <MemoryRouter>
        <NotFoundPanel heading="Missing thing" message="Try another route." />
      </MemoryRouter>
    )
    act(() => vi.runAllTimers())

    expect(document.title).toBe('Page-owned title')
  })
})
