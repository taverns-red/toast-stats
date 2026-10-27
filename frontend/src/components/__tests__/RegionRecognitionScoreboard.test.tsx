/* Region page District Recognition scoreboard (#2307). */

import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { RegionRecognitionScoreboard } from '../RegionRecognitionScoreboard'
import type { RecognitionScoreboard } from '../../utils/regionRecognition'

const board: RecognitionScoreboard = {
  districts: 7,
  unknown: 1,
  rows: [
    {
      tier: 'Distinguished',
      meeting: 2,
      onTrack: 3,
      nearest: {
        districtId: '86',
        paidClubsRemaining: 0,
        paymentsRemaining: 1234,
        distinguishedClubsRemaining: 5,
      },
    },
    {
      tier: 'Select',
      meeting: 1,
      onTrack: 0,
      nearest: {
        districtId: '61',
        paidClubsRemaining: 0,
        paymentsRemaining: 0,
        distinguishedClubsRemaining: 0,
      },
    },
    { tier: 'Presidents', meeting: 7, nearest: null, onTrack: null },
  ],
}

const PACE = { referenceDate: '2025-09-30', referenceProgramYear: '2025-2026' }

const renderBoard = (
  scoreboard: RecognitionScoreboard | null,
  pace: typeof PACE | null = PACE
) =>
  render(
    <MemoryRouter>
      <RegionRecognitionScoreboard
        scoreboard={scoreboard}
        programYear="2026-2027"
        pace={pace}
      />
    </MemoryRouter>
  )

describe('RegionRecognitionScoreboard (#2307)', () => {
  it('is a labelled section with one card per tier', () => {
    renderBoard(board)
    const section = screen.getByRole('region', {
      name: /district recognition/i,
    })
    const cards = within(section).getAllByTestId('recognition-tier')
    expect(cards.map(c => c.getAttribute('data-tier'))).toEqual([
      'Distinguished',
      'Select',
      'Presidents',
    ])
    expect(cards[0]).toHaveTextContent('2 of 7')
    expect(cards[2]).toHaveTextContent("President's")
  })

  it('names the nearest district and only the metrics still short', () => {
    renderBoard(board)
    const [dist, select, pres] = screen.getAllByTestId('recognition-tier')
    expect(dist).toHaveTextContent('District 86')
    expect(dist).toHaveTextContent('1,234 payments')
    expect(dist).toHaveTextContent('5 Distinguished clubs')
    expect(dist).not.toHaveTextContent('paid clubs')
    expect(select).toHaveTextContent(/District 61.*metrics met/i)
    expect(pres).toHaveTextContent(/every district meets this tier/i)
  })

  it('links to the methodology entry and notes Unknown districts', () => {
    renderBoard(board)
    expect(
      screen.getByRole('link', { name: /how this is counted/i })
    ).toHaveAttribute('href', '/methodology#region-recognition')
    expect(screen.getByTestId('region-recognition')).toHaveTextContent(
      /1 district earns a tier on the metrics/i
    )
  })

  it('says when the snapshot has no recognition data', () => {
    renderBoard(null)
    expect(screen.getByTestId('region-recognition')).toHaveTextContent(
      /not available for this date/i
    )
    expect(screen.queryAllByTestId('recognition-tier')).toHaveLength(0)
  })

  it("labels meeting today apart from on track by last year's pace", () => {
    renderBoard(board)
    const [dist, select, pres] = screen.getAllByTestId('recognition-tier')
    expect(dist).toHaveTextContent(/2 of 7\s*meet it today/i)
    expect(within(dist!).getByTestId('recognition-on-track')).toHaveTextContent(
      "On track, based on last year's pace: 3 of 7"
    )
    expect(
      within(select!).getByTestId('recognition-on-track')
    ).toHaveTextContent("On track, based on last year's pace: 0 of 7")
    expect(within(pres!).getByTestId('recognition-on-track')).toHaveTextContent(
      /not available/i
    )
    expect(screen.getByTestId('region-recognition')).toHaveTextContent(
      /median of the districts that earned it or higher in 2025-2026, on 2025-09-30/i
    )
  })

  it("says when last year's pace is not available", () => {
    renderBoard(board, null)
    expect(screen.queryAllByTestId('recognition-on-track')).toHaveLength(0)
    expect(screen.getByTestId('region-recognition')).toHaveTextContent(
      /last year's pace is not available for this date/i
    )
  })
})
