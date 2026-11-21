import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ErrorDisplay } from '../ErrorDisplay'

/* Volunteers never see an engineer's message. Only a recognized network or
   not-found failure gets its own sentence; anything else gets the generic
   one, and the raw text goes to the console. */

describe('ErrorDisplay message handling', () => {
  it.each([
    'Cannot read properties of undefined (reading "rows")',
    'boom',
    'Unexpected token < in JSON at position 0',
  ])('hides the raw message "%s" behind a plain sentence', raw => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<ErrorDisplay error={new Error(raw)} subject="this club" />)
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent("We couldn't load this club.")
    expect(alert).not.toHaveTextContent(raw)
  })

  it('logs the raw message for developers', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<ErrorDisplay error={new Error('boom')} subject="this club" />)
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('boom'))
  })

  it('still names a network failure and a missing page', () => {
    const { rerender } = render(
      <ErrorDisplay error="Failed to fetch" subject="the regions" />
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      "We couldn't load the regions. Check your connection and try again."
    )
    rerender(<ErrorDisplay error="404 Not Found" subject="this division" />)
    expect(screen.getByRole('alert')).toHaveTextContent(
      'This division could not be found.'
    )
  })

  it('shows the raw text only when the caller asks for details', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<ErrorDisplay error={new Error('boom')} showDetails />)
    expect(screen.getByText('boom')).toBeInTheDocument()
  })
})
