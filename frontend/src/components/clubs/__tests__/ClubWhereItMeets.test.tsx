import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ClubWhereItMeets } from '../ClubWhereItMeets'

/**
 * #1783 — the hero's "where it meets" line. Presentational: it renders the
 * already-built `ClubMeetingInfo` and nothing else.
 */
const INFO = {
  schedule: 'Tuesday · 7:30 pm',
  mode: 'Online or hybrid',
  place: 'Kingston, ON',
  websiteUrl: 'https://limestonetm.com/',
  contactUrl: 'https://www.toastmasters.org/Find-a-Club/00003045',
}

describe('ClubWhereItMeets', () => {
  it('renders schedule, mode and place', () => {
    render(<ClubWhereItMeets info={INFO} />)
    expect(screen.getByText('Tuesday · 7:30 pm')).toBeInTheDocument()
    expect(screen.getByText('Online or hybrid')).toBeInTheDocument()
    expect(screen.getByText('Kingston, ON')).toBeInTheDocument()
  })

  it('links to the club website and to toastmasters.org in a new tab', () => {
    render(<ClubWhereItMeets info={INFO} />)
    const site = screen.getByRole('link', { name: /club website/i })
    expect(site).toHaveAttribute('href', 'https://limestonetm.com/')
    expect(site).toHaveAttribute('target', '_blank')
    expect(site).toHaveAttribute('rel', 'noopener noreferrer')

    const contact = screen.getByRole('link', {
      name: /contact on toastmasters\.org/i,
    })
    expect(contact).toHaveAttribute(
      'href',
      'https://www.toastmasters.org/Find-a-Club/00003045'
    )
    expect(contact).toHaveAttribute('target', '_blank')
    expect(contact).toHaveAttribute('rel', 'noopener noreferrer')
  })

  // #1843 — the phone hero hides the website link (CSS hook); the page
  // offers it as a row instead.
  it('marks the website item so the phone hero can drop it', () => {
    render(<ClubWhereItMeets info={INFO} />)
    const site = screen.getByRole('link', { name: /club website/i })
    expect(site.closest('li')).toHaveClass('club-meets__item--website')
  })

  it('skips parts that are absent', () => {
    render(
      <ClubWhereItMeets
        info={{ ...INFO, schedule: null, mode: null, websiteUrl: null }}
      />
    )
    expect(
      screen.queryByRole('link', { name: /club website/i })
    ).not.toBeInTheDocument()
    expect(screen.queryByText(/7:30/)).not.toBeInTheDocument()
    expect(screen.getByText('Kingston, ON')).toBeInTheDocument()
  })

  it('renders nothing when there is no info', () => {
    const { container } = render(<ClubWhereItMeets info={null} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('ClubWhereItMeets — unreadable meeting text (#2247)', () => {
  it('shows the not-readable note beside the contact link, no schedule', () => {
    render(
      <ClubWhereItMeets
        info={{
          ...INFO,
          schedule: null,
          scheduleNote: 'Meeting time not readable — see toastmasters.org',
        }}
      />
    )
    const links = screen.getByRole('list', { name: 'Club links' })
    expect(links).toHaveTextContent(
      'Meeting time not readable — see toastmasters.org'
    )
    expect(
      screen.getByRole('link', { name: /contact on toastmasters\.org/i })
    ).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('?')
  })
})

describe('ClubWhereItMeets — half-readable meeting text (#2247)', () => {
  it('shows the readable time and the day note beside the contact link', () => {
    render(
      <ClubWhereItMeets
        info={{
          ...INFO,
          schedule: '6:30 - 8:30 PM',
          scheduleNote: 'day not readable — see toastmasters.org',
        }}
      />
    )
    expect(
      screen.getByRole('list', { name: 'Where the club meets' })
    ).toHaveTextContent('6:30 - 8:30 PM')
    expect(screen.getByRole('list', { name: 'Club links' })).toHaveTextContent(
      'day not readable — see toastmasters.org'
    )
  })
})

describe('ClubWhereItMeets — unreadable address (#2268)', () => {
  it('shows the readable place and the address note beside the contact link', () => {
    render(
      <ClubWhereItMeets
        info={{
          ...INFO,
          place: 'Xishiku, Xic, BJ',
          placeNote: 'address partly not readable — see toastmasters.org',
        }}
      />
    )
    expect(
      screen.getByRole('list', { name: 'Where the club meets' })
    ).toHaveTextContent('Xishiku, Xic, BJ')
    expect(screen.getByRole('list', { name: 'Club links' })).toHaveTextContent(
      'address partly not readable — see toastmasters.org'
    )
  })

  it('shows the note alone when no part of the address is readable', () => {
    render(
      <ClubWhereItMeets
        info={{
          schedule: null,
          mode: null,
          place: null,
          placeNote: 'Address not readable — see toastmasters.org',
          websiteUrl: null,
          contactUrl: 'https://www.toastmasters.org/Find-a-Club/06513503',
        }}
      />
    )
    expect(screen.getByRole('list', { name: 'Club links' })).toHaveTextContent(
      'Address not readable — see toastmasters.org'
    )
  })
})
