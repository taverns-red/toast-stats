/* /videos — the list of published how-to videos (#2310). Static page over
   the typed catalogue in content/howToVideos.ts: every entry renders a
   lazy native <video> (no autoplay, preload="none") with the cut that suits
   the viewport, plus direct links to both MP4 files, grouped by role. */

import React from 'react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  render,
  screen,
  cleanup,
  waitFor,
  within,
} from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import VideosPage from '../VideosPage'
import { HOW_TO_VIDEOS, groupByPrimaryRole } from '../../content/howToVideos'

const mobile = vi.hoisted(() => ({ value: false }))
vi.mock('../../hooks/useIsMobile', () => ({
  useIsMobile: () => mobile.value,
}))

const renderPage = () =>
  render(
    <MemoryRouter>
      <VideosPage />
    </MemoryRouter>
  )

afterEach(() => {
  cleanup()
  mobile.value = false
})

const videos = () =>
  Array.from(document.querySelectorAll('video')) as HTMLVideoElement[]

describe('VideosPage (#2310)', () => {
  it('renders a level-1 heading and sets the document title', async () => {
    renderPage()
    expect(
      screen.getByRole('heading', { level: 1, name: /how-to videos/i })
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(document.title).toBe('How-to videos — Toast Stats')
    )
  })

  it('renders one video per catalogue entry, with its title', () => {
    renderPage()
    expect(videos()).toHaveLength(HOW_TO_VIDEOS.length)
    for (const v of HOW_TO_VIDEOS) {
      expect(
        screen.getByRole('heading', { level: 3, name: v.title })
      ).toBeInTheDocument()
    }
  })

  it('never autoplays and loads nothing until asked', () => {
    renderPage()
    for (const el of videos()) {
      expect(el).toHaveAttribute('controls')
      expect(el).toHaveAttribute('preload', 'none')
      expect(el).not.toHaveAttribute('autoplay')
      expect(el.getAttribute('poster')).toMatch(/^data:image\/svg\+xml,/)
    }
  })

  it('plays the desktop cut on wider screens', () => {
    renderPage()
    expect(videos().map(el => el.getAttribute('src'))).toEqual(
      HOW_TO_VIDEOS.map(v => v.desktopUrl)
    )
  })

  it('plays the mobile cut on a phone', () => {
    mobile.value = true
    renderPage()
    expect(videos().map(el => el.getAttribute('src'))).toEqual(
      HOW_TO_VIDEOS.map(v => v.mobileUrl)
    )
  })

  it('links directly to both MP4 files for every video', () => {
    renderPage()
    for (const v of HOW_TO_VIDEOS) {
      const card = screen.getByTestId(`video-${v.id}`)
      expect(
        within(card).getByRole('link', { name: /desktop mp4/i })
      ).toHaveAttribute('href', v.desktopUrl)
      expect(
        within(card).getByRole('link', { name: /phone mp4/i })
      ).toHaveAttribute('href', v.mobileUrl)
    }
  })

  it('names every role a video is for', () => {
    renderPage()
    for (const v of HOW_TO_VIDEOS) {
      const card = screen.getByTestId(`video-${v.id}`)
      for (const role of v.roles) expect(card).toHaveTextContent(role)
      expect(card).toHaveTextContent(v.description)
    }
  })

  it('groups the videos under a heading per primary role', () => {
    renderPage()
    const groups = groupByPrimaryRole(HOW_TO_VIDEOS)
    const headings = screen
      .getAllByRole('heading', { level: 2 })
      .map(h => h.textContent)
    expect(headings).toEqual(groups.map(g => g.role))
  })
})
