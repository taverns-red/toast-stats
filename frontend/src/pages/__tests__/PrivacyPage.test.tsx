import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import PrivacyPage from '../PrivacyPage'

/* The note must say what is really stored (#2584 review). */

function renderPage() {
  return render(
    <MemoryRouter>
      <PrivacyPage />
    </MemoryRouter>
  )
}

const section = (id: string) => screen.getByTestId(id)

describe('PrivacyPage (#2584)', () => {
  it('says the consent cookie is the only thing kept after the tab closes', () => {
    renderPage()
    const text = section('privacy-choice').textContent ?? ''
    expect(text).toMatch(/only thing kept after the tab closes/i)
    expect(text).not.toMatch(/only thing stored/i)
  })

  it('stays honest that none still uses the tab session', () => {
    renderPage()
    expect(section('privacy-none').textContent).toMatch(
      /while this tab is open/i
    )
  })

  it.each(['privacy-all', 'privacy-minimal'])(
    '%s mentions the short log of recent errors on this device',
    id => {
      renderPage()
      expect(section(id).textContent).toMatch(
        /short log of recent errors on this device/i
      )
    }
  )

  it('none says the error log also ends with the tab', () => {
    renderPage()
    expect(section('privacy-none').textContent).toMatch(/error log/i)
  })
})
