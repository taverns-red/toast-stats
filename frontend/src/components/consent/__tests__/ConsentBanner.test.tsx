import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { ConsentBanner } from '../ConsentBanner'
import {
  CONSENT_COOKIE,
  closeConsentSettings,
  getConsent,
  openConsentSettings,
} from '../../../utils/consent'

function renderBanner() {
  return render(
    <MemoryRouter>
      <ConsentBanner immediate />
    </MemoryRouter>
  )
}
const region = () =>
  screen.queryByRole('region', { name: /privacy and cookies/i })

describe('ConsentBanner (#2584)', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    document.cookie = `${CONSENT_COOKIE}=; Max-Age=0; Path=/`
    closeConsentSettings()
  })

  it('shows three equal buttons and none is pre-selected', () => {
    renderBanner()
    const buttons = region()!.querySelectorAll('button')
    expect([...buttons].map(b => b.textContent)).toEqual([
      'Keep all',
      'Keep minimal',
      'Keep none',
    ])
    for (const b of buttons) {
      expect(b).not.toHaveAttribute('aria-pressed')
      expect(b.className).toBe(buttons[0]!.className)
    }
  })

  it('links to the privacy note', () => {
    renderBanner()
    expect(
      screen.getByRole('link', { name: /what each choice/i })
    ).toHaveAttribute('href', '/privacy')
  })

  it.each([
    ['Keep all', 'all'],
    ['Keep minimal', 'minimal'],
    ['Keep none', 'none'],
  ])('%s records %s and hides the banner', async (label, level) => {
    renderBanner()
    await userEvent.click(screen.getByRole('button', { name: label }))
    expect(getConsent()).toBe(level)
    expect(region()).toBeNull()
  })

  it('stays hidden once decided, and reopens from settings with a Close', async () => {
    document.cookie = 'rt_consent=v1.minimal; Path=/'
    renderBanner()
    expect(region()).toBeNull()
    act(() => openConsentSettings())
    expect(region()).toHaveTextContent(/minimal/i)
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(getConsent()).toBe('minimal')
    expect(region()).toBeNull()
  })

  it('has no Close while undecided (a choice is needed to stop asking)', () => {
    renderBanner()
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull()
  })
})
