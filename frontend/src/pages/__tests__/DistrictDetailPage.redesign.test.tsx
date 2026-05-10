/* District detail page redesign chrome (#358).
   Asserts the new header (breadcrumbs + eyebrow + h1 + lede + action
   cluster). The detailed dynamic lede (Region name + active clubs +
   divisions + overall rank) is deferred to a follow-up sub-issue when
   the rank/region data flow is settled — this issue ships the chrome. */

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, within } from '@testing-library/react'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { renderWithProviders } from '../../__tests__/test-utils'

vi.mock('../../services/cdn', async () => {
  const actual =
    await vi.importActual<typeof import('../../services/cdn')>(
      '../../services/cdn'
    )
  return {
    ...actual,
    fetchCdnDates: vi
      .fn()
      .mockResolvedValue({ dates: [], count: 0, generatedAt: '2025-01-01' }),
    fetchCdnSnapshotIndex: vi.fn().mockResolvedValue({}),
    fetchCdnManifest: vi.fn().mockResolvedValue({
      latestSnapshotDate: '2025-11-22',
      generatedAt: '2025-01-01',
    }),
    fetchCdnRankings: vi
      .fn()
      .mockResolvedValue({ rankings: [], date: '2025-11-22' }),
  }
})

vi.mock('../../hooks/useDistricts', () => ({
  useDistricts: () => ({
    data: { districts: [{ id: '57', name: 'District 57' }] },
    isLoading: false,
    isError: false,
  }),
}))

vi.mock('../../hooks/useDistrictData', () => ({
  useDistrictCachedDates: () => ({
    data: ['2025-11-22', '2025-10-15'],
    isLoading: false,
    isError: false,
  }),
}))

vi.mock('../../hooks/useDistrictAnalytics', async () => {
  const actual = await vi.importActual<
    typeof import('../../hooks/useDistrictAnalytics')
  >('../../hooks/useDistrictAnalytics')
  return {
    ...actual,
    useDistrictAnalytics: () => ({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    }),
  }
})

import DistrictDetailPage from '../DistrictDetailPage'

describe('District detail page redesign chrome (#358)', () => {
  beforeEach(() => vi.clearAllMocks())

  describe('breadcrumbs', () => {
    it('renders a Districts → District N breadcrumb trail', () => {
      renderWithProviders(<DistrictDetailPage />, {
        initialEntries: ['/district/57'],
      })
      const nav = screen.getByRole('navigation', { name: /breadcrumb/i })
      // First crumb is a link back to /
      const districtsLink = within(nav).getByRole('link', {
        name: /districts/i,
      })
      expect(districtsLink).toHaveAttribute('href', '/')
      // Second crumb is the current district (not a link — current location)
      expect(within(nav).getByText(/district 57/i)).toBeInTheDocument()
    })
  })

  describe('page header', () => {
    it('renders the program-year eyebrow (en-dash format)', () => {
      renderWithProviders(<DistrictDetailPage />, {
        initialEntries: ['/district/57'],
      })
      expect(
        screen.getByText(/program year 20\d{2}[–-]20\d{2}/i)
      ).toBeInTheDocument()
    })

    it('renders the redesigned h1 "District N"', () => {
      renderWithProviders(<DistrictDetailPage />, {
        initialEntries: ['/district/57'],
      })
      expect(
        screen.getByRole('heading', { level: 1, name: /^district 57$/i })
      ).toBeInTheDocument()
    })

    it('renders a lede paragraph below the h1', () => {
      renderWithProviders(<DistrictDetailPage />, {
        initialEntries: ['/district/57'],
      })
      // Generic copy until follow-up wires dynamic Region/clubs/rank data
      expect(screen.getByTestId('district-detail-lede')).toBeInTheDocument()
    })
  })

  describe('action cluster', () => {
    it('keeps the existing program-year + date selectors visible', () => {
      renderWithProviders(<DistrictDetailPage />, {
        initialEntries: ['/district/57'],
      })
      // Date selector exists (label "View Specific Date" or similar)
      expect(screen.getByLabelText(/view specific date/i)).toBeInTheDocument()
    })

    it('renders an Export button', () => {
      renderWithProviders(<DistrictDetailPage />, {
        initialEntries: ['/district/57'],
      })
      // The existing DistrictExportButton renders a button labeled Export
      expect(
        screen.getByRole('button', { name: /export/i })
      ).toBeInTheDocument()
    })

    it('renders a Share button (primary loyal)', () => {
      renderWithProviders(<DistrictDetailPage />, {
        initialEntries: ['/district/57'],
      })
      // Share button is new in #358 — copy URL to clipboard placeholder.
      expect(screen.getByRole('button', { name: /share/i })).toBeInTheDocument()
    })
  })

  describe('lesson 49/50 nesting check', () => {
    it('does not declare nested min-height: 100vh inside AppShell', () => {
      // Static guard: the new .district-detail-page-root rule must NOT set
      // min-height because AppShell already owns the viewport wrapper.
      const css = readFileSync(
        resolve(__dirname, '../../styles/components/app-shell.css'),
        'utf-8'
      )
      const rule = css.match(
        /\.district-detail-page-root\s*\{([\s\S]*?)\n\s*\}/
      )
      expect(rule).toBeTruthy()
      const stripped = (rule?.[1] ?? '').replace(/\/\*[\s\S]*?\*\//g, '')
      expect(stripped).not.toMatch(/min-height\s*:\s*100vh\s*;/)
    })
  })
})
