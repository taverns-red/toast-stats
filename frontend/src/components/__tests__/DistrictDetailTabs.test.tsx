/* District detail tab bar (#359). Mounts the small extracted component
   directly — no full-page render — so the suite stays under the 5s
   testTimeout cap when --coverage is enabled (Lesson 51). */

import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import { DistrictDetailTabs, type DistrictTabId } from '../DistrictDetailTabs'

const renderTabs = (
  overrides: Partial<React.ComponentProps<typeof DistrictDetailTabs>> = {}
) =>
  render(
    <DistrictDetailTabs
      activeTab="overview"
      onTabChange={() => {}}
      clubsCount={305}
      divisionsCount={7}
      {...overrides}
    />
  )

describe('DistrictDetailTabs (#359)', () => {
  describe('structure', () => {
    it('renders all 6 tabs in order', () => {
      renderTabs()
      const tablist = screen.getByRole('tablist', {
        name: /district analysis tabs/i,
      })
      const tabs = within(tablist).getAllByRole('tab')
      // Tabs render label + (optional) count badge as siblings; textContent
      // concatenates them without whitespace.
      expect(tabs.map(t => t.textContent?.trim())).toEqual([
        'Overview',
        'Clubs305',
        'Divisions & Areas7',
        'Trends',
        'Analytics',
        'Global Rankings',
      ])
    })

    it('marks the active tab with aria-selected="true" and others false', () => {
      renderTabs({ activeTab: 'trends' })
      const tablist = screen.getByRole('tablist')
      const trends = within(tablist).getByRole('tab', { name: /trends/i })
      expect(trends).toHaveAttribute('aria-selected', 'true')

      const overview = within(tablist).getByRole('tab', {
        name: /overview/i,
      })
      expect(overview).toHaveAttribute('aria-selected', 'false')
    })
  })

  describe('count badges', () => {
    it('shows the clubs count next to the Clubs tab', () => {
      renderTabs({ clubsCount: 305 })
      const tablist = screen.getByRole('tablist')
      const clubs = within(tablist).getByRole('tab', { name: /^clubs/i })
      expect(within(clubs).getByText('305')).toBeInTheDocument()
    })

    it('shows the divisions count next to the Divisions & Areas tab', () => {
      renderTabs({ divisionsCount: 7 })
      const tablist = screen.getByRole('tablist')
      const divs = within(tablist).getByRole('tab', { name: /divisions/i })
      expect(within(divs).getByText('7')).toBeInTheDocument()
    })

    it('hides count badges when count is 0 or undefined', () => {
      renderTabs({ clubsCount: 0, divisionsCount: undefined })
      const tablist = screen.getByRole('tablist')
      const clubs = within(tablist).getByRole('tab', { name: /^clubs/i })
      expect(within(clubs).queryByText('0')).not.toBeInTheDocument()
      const divs = within(tablist).getByRole('tab', { name: /divisions/i })
      // No number child element should be present
      expect(divs.querySelector('.district-detail-tabs__count')).toBeNull()
    })
  })

  describe('interaction', () => {
    it('fires onTabChange with the tab id when a non-active tab is clicked', () => {
      const onTabChange = vi.fn()
      renderTabs({ activeTab: 'overview', onTabChange })
      const tablist = screen.getByRole('tablist')
      fireEvent.click(within(tablist).getByRole('tab', { name: /^clubs/i }))
      expect(onTabChange).toHaveBeenCalledWith('clubs' satisfies DistrictTabId)
    })

    it('does not fire onTabChange when the already-active tab is clicked', () => {
      const onTabChange = vi.fn()
      renderTabs({ activeTab: 'overview', onTabChange })
      const tablist = screen.getByRole('tablist')
      fireEvent.click(within(tablist).getByRole('tab', { name: /overview/i }))
      expect(onTabChange).not.toHaveBeenCalled()
    })
  })

  describe('accessibility', () => {
    it('exposes a tablist landmark with an aria-label', () => {
      renderTabs()
      expect(
        screen.getByRole('tablist', { name: /district analysis tabs/i })
      ).toBeInTheDocument()
    })
  })
})
