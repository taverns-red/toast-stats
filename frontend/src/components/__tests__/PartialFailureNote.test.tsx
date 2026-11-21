import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PartialFailureNote } from '../PartialFailureNote'

describe('PartialFailureNote', () => {
  it('says what could not load, then what is still shown', () => {
    render(
      <PartialFailureNote subject="1 region">
        The rest of the map is shown.
      </PartialFailureNote>
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      "We couldn't load 1 region. The rest of the map is shown."
    )
  })

  it('has no button without a retry', () => {
    render(<PartialFailureNote subject="the changes" />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('offers Try again, at least 44px tall, when a retry exists', async () => {
    const onRetry = vi.fn()
    render(<PartialFailureNote subject="the changes" onRetry={onRetry} />)
    const button = screen.getByRole('button', { name: /try again/i })
    expect(button.className).toContain('min-h-[44px]')
    await userEvent.click(button)
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
