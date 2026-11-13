import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
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
    // The three choices; Details (phone) is not a choice.
    const buttons = region()!.querySelectorAll('.consent-banner__button')
    // D10: the decline option comes first, at every width, in the DOM.
    expect([...buttons].map(b => b.textContent)).toEqual([
      'Keep none',
      'Keep minimal',
      'Keep all',
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

  /* Phone: one line, Keep none / Keep all, and a Details control (D10,
     #2674). The wording is unchanged and the full text stays in the DOM, so
     Details only reveals what is already there; nothing is pre-selected. */
  describe('compact phone layout (D10, #2674)', () => {
    const css = readFileSync(
      resolve(
        dirname(fileURLToPath(import.meta.url)),
        '../../../styles/components/consent.css'
      ),
      'utf-8'
    ).replace(/\/\*[\s\S]*?\*\//g, '')
    const phone = css.match(
      /@media \(max-width: 767px\)\s*\{([\s\S]*?)\n\}/
    )?.[1]

    it('has a Details control, collapsed first, that reveals the full text', async () => {
      renderBanner()
      const details = screen.getByRole('button', { name: 'Details' })
      expect(details).toHaveAttribute('aria-expanded', 'false')
      expect(region()).toHaveAttribute('data-expanded', 'false')
      const controlled = details
        .getAttribute('aria-controls')!
        .split(' ')
        .map(id => document.getElementById(id)!)
      expect(controlled.length).toBeGreaterThanOrEqual(2)
      expect(
        controlled.some(el =>
          el.contains(screen.getByRole('link', { name: /what each choice/i }))
        )
      ).toBe(true)
      expect(controlled).toContain(
        screen.getByRole('button', { name: 'Keep minimal' })
      )
      await userEvent.click(details)
      expect(details).toHaveAttribute('aria-expanded', 'true')
      expect(region()).toHaveAttribute('data-expanded', 'true')
      await userEvent.click(details)
      expect(region()).toHaveAttribute('data-expanded', 'false')
    })

    it('Details does not record a choice, and keeps the wording and the three levels', async () => {
      renderBanner()
      await userEvent.click(screen.getByRole('button', { name: 'Details' }))
      expect(getConsent()).toBeNull()
      expect(region()).toHaveTextContent(
        'May we count visits with Google Analytics?'
      )
      expect(
        [...region()!.querySelectorAll('.consent-banner__button')].map(
          b => b.textContent
        )
      ).toEqual(['Keep none', 'Keep minimal', 'Keep all'])
    })

    /* Focus order (D10 review): what Details reveals must follow the Details
       button in the DOM, so keyboard and screen-reader users reach it going
       forward from the control that opened it. Keep none stays first. */
    it('puts everything Details reveals after the Details button', () => {
      renderBanner()
      const details = screen.getByRole('button', { name: 'Details' })
      const follows = (el: Element) =>
        Boolean(
          details.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING
        )
      for (const id of details.getAttribute('aria-controls')!.split(' ')) {
        expect(follows(document.getElementById(id)!)).toBe(true)
      }
      expect(
        follows(screen.getByRole('link', { name: /what each choice/i }))
      ).toBe(true)
      expect(region()!.querySelector('button')).toHaveTextContent('Keep none')
    })

    it('CSS: below 768 the title, link and Keep minimal wait behind Details', () => {
      expect(phone).toBeDefined()
      expect(phone).toMatch(
        /\.consent-banner\[data-expanded='false'\]\s+\.consent-banner__detail\s*\{[^}]*display:\s*none/
      )
      expect(phone).toMatch(
        /\.consent-banner__title[^{]*\{[^}]*display:\s*none/
      )
    })

    it('CSS: from 768 up the Details control does not exist', () => {
      expect(css).toMatch(/\.consent-banner__details\s*\{[^}]*display:\s*none/)
      expect(phone).toMatch(
        /\.consent-banner__details\s*\{[^}]*display:\s*(?:inline-)?flex/
      )
    })

    it('CSS: the Details control is a 44px target', () => {
      expect(phone).toMatch(
        /\.consent-banner__details\s*\{[^}]*min-height:\s*44px/
      )
    })

    it('CSS: sits above the section bar and clear of its safe area, never over it', () => {
      expect(css).toMatch(
        /body:has\(\.section-bar\)\s+\.consent-banner\s*\{[^}]*bottom:\s*calc\(\s*56px\s*\+\s*env\(safe-area-inset-bottom/
      )
    })

    it('CSS: uses the banner token, not a raw z-index', () => {
      expect(css).toMatch(/z-index:\s*var\(--z-banner\)/)
    })
  })

  it('has no Close while undecided (a choice is needed to stop asking)', () => {
    renderBanner()
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull()
  })
})
