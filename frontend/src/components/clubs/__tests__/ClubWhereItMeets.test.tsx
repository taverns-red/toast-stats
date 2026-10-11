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
