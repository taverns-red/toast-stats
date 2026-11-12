/**
 * TierCell accessible text (#2676, spec §3.2): assistive tech hears the full
 * tier name, "Select Distinguished, provisional", while sighted readers see
 * "Select" with "provisional" on a second line.
 */

import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { TierCell } from '../dataTable/cells/TierCell'

const text = (el: HTMLElement) => el.textContent?.replace(/\s+/g, ' ').trim()

describe('TierCell accessible text (#2676)', () => {
  it('reads "Select Distinguished, provisional" for a provisional Select', () => {
    const { container } = render(<TierCell level="Select" provisional />)
    expect(text(container)).toBe('Select Distinguished, provisional')
  })

  it('reads "Select Distinguished" for a confirmed Select', () => {
    const { container } = render(
      <TierCell level="Select" provisional={false} />
    )
    expect(text(container)).toBe('Select Distinguished')
  })

  it('does not repeat the word for the Distinguished tier', () => {
    const { container } = render(<TierCell level="Distinguished" provisional />)
    expect(text(container)).toBe('Distinguished, provisional')
  })

  it('keeps the visible name short', () => {
    const { container } = render(<TierCell level="Select" provisional />)
    const name = container.querySelector('.dt-tier__name') as HTMLElement
    const visible = [...name.childNodes]
      .filter(n => n.nodeType === Node.TEXT_NODE)
      .map(n => n.textContent)
      .join('')
    expect(visible).toBe('Select')
  })
})
