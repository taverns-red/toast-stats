/**
 * DateNotice (#2635) — the one-line "No data for <date>" notice the controls
 * hooks raise when a ?date= names no snapshot.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { act, render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import { DateNotice } from '../DateNotice'
import { setDateNotice } from '../../hooks/dateNoticeStore'

afterEach(() => {
  act(() => setDateNotice(null))
  cleanup()
})

describe('DateNotice (#2635)', () => {
  it('renders nothing while there is no notice', () => {
    render(
      <MemoryRouter>
        <DateNotice />
      </MemoryRouter>
    )
    expect(screen.queryByTestId('date-notice')).toBeNull()
  })

  it('names the missing date and the date shown instead', () => {
    render(
      <MemoryRouter>
        <DateNotice />
      </MemoryRouter>
    )
    act(() => setDateNotice({ requested: '2020-01-01', shown: '2026-11-11' }))
    const notice = screen.getByTestId('date-notice')
    expect(notice).toHaveAttribute('role', 'status')
    expect(notice).toHaveTextContent(
      'No data for Jan 1, 2020. Showing Nov 11, 2026, the closest date we have.'
    )
  })

  it('does not echo an unparseable value as a date', () => {
    render(
      <MemoryRouter>
        <DateNotice />
      </MemoryRouter>
    )
    act(() => setDateNotice({ requested: 'notadate', shown: '2026-11-11' }))
    const notice = screen.getByTestId('date-notice')
    expect(notice).toHaveTextContent('That date is not valid.')
    expect(notice).toHaveTextContent('Showing Nov 11, 2026')
    expect(notice).not.toHaveTextContent('Invalid Date')
  })

  it('can be dismissed', async () => {
    render(
      <MemoryRouter>
        <DateNotice />
      </MemoryRouter>
    )
    act(() => setDateNotice({ requested: '2020-01-01', shown: '2026-11-11' }))
    await userEvent.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(screen.queryByTestId('date-notice')).toBeNull()
  })

  it('goes away when the visitor navigates to another page', async () => {
    const Nav: React.FC = () => {
      const navigate = useNavigate()
      return <button onClick={() => navigate('/awards')}>go</button>
    }
    render(
      <MemoryRouter initialEntries={['/clubs']}>
        <DateNotice />
        <Nav />
      </MemoryRouter>
    )
    act(() => setDateNotice({ requested: '2020-01-01', shown: '2026-11-11' }))
    expect(screen.getByTestId('date-notice')).toBeInTheDocument()
    await userEvent.click(screen.getByText('go'))
    expect(screen.queryByTestId('date-notice')).toBeNull()
  })
})
