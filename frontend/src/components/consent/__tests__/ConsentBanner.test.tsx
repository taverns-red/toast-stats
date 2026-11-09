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

  /* LCP guard (#2584): the banner's first version was the LCP element on
     landing (2.0 s to 3.6 s on mobile) because its paragraph was bigger than
     the page's own lede. Keep each text block short and the link out of the
     copy paragraph; Lighthouse and the preview smokes confirm the result. */
  it('keeps every text block small so it cannot become the LCP element', () => {
    renderBanner()
    const text = region()!.querySelector('.consent-banner__text')!
    expect(text.textContent!.length).toBeLessThanOrEqual(45)
    expect(text.querySelector('a')).toBeNull()
  })

  describe('focus and Escape (#2584 review)', () => {
    function renderWithPage() {
      return render(
        <MemoryRouter>
          <a href="#main-content">Skip</a>
          <button type="button">Privacy &amp; cookies</button>
          <main id="main-content">content</main>
          <ConsentBanner immediate />
        </MemoryRouter>
      )
    }

    it('reopened: choosing returns focus to the control that opened it', async () => {
      document.cookie = 'rt_consent=v1.minimal; Path=/'
      renderWithPage()
      const opener = screen.getByRole('button', { name: 'Privacy & cookies' })
      opener.focus()
      act(() => openConsentSettings())
      await userEvent.click(screen.getByRole('button', { name: 'Keep all' }))
      expect(opener).toHaveFocus()
    })

    it('reopened: Close returns focus to the control that opened it', async () => {
      document.cookie = 'rt_consent=v1.minimal; Path=/'
      renderWithPage()
      const opener = screen.getByRole('button', { name: 'Privacy & cookies' })
      opener.focus()
      act(() => openConsentSettings())
      await userEvent.click(screen.getByRole('button', { name: 'Close' }))
      expect(opener).toHaveFocus()
    })

    it('reopened: Escape closes it and returns focus', async () => {
      document.cookie = 'rt_consent=v1.minimal; Path=/'
      renderWithPage()
      const opener = screen.getByRole('button', { name: 'Privacy & cookies' })
      opener.focus()
      act(() => openConsentSettings())
      await userEvent.keyboard('{Escape}')
      expect(region()).toBeNull()
      expect(getConsent()).toBe('minimal')
      expect(opener).toHaveFocus()
    })

    it('first visit: choosing moves focus to the main content', async () => {
      renderWithPage()
      await userEvent.click(screen.getByRole('button', { name: 'Keep none' }))
      expect(document.activeElement).toBe(
        document.getElementById('main-content')
      )
    })

    it('first visit: Escape does not close it (a choice is needed)', async () => {
      renderWithPage()
      screen.getByRole('button', { name: 'Keep all' }).focus()
      await userEvent.keyboard('{Escape}')
      expect(region()).not.toBeNull()
      expect(getConsent()).toBeNull()
    })
  })

  it('has no Close while undecided (a choice is needed to stop asking)', () => {
    renderBanner()
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull()
  })
})
