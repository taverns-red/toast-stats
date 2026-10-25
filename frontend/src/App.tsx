import React, { Suspense } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './config/queryClient'
import { ProgramYearProvider } from './contexts/ProgramYearContext'
import { DarkModeProvider } from './contexts/DarkModeContext'
import DistrictsPage from './pages/DistrictsPage'
import AppShell from './components/AppShell'
import ErrorPage from './components/ErrorPage'
import { DistrictHubRouteFallback } from './components/DistrictHubRouteFallback'
// Unpadded /region/1… redirects to the padded canonical id (#2130)
import { CanonicalRegionRoute } from './components/rollups/CanonicalRegionRoute'
import { DistrictAnalyticsRedirect } from './components/DistrictAnalyticsRedirect'

// Code-split: DistrictDetailPage (816 lines + recharts) loads on navigation (#169)
const DistrictDetailPage = React.lazy(
  () => import('./pages/DistrictDetailPage')
)

// Code-split: ClubDetailPage — full club subpage (#208)
const ClubDetailPage = React.lazy(() => import('./pages/ClubDetailPage'))

// Code-split: ClubHistoryPage — per-club multi-year history subpage (#1229)
const ClubHistoryPage = React.lazy(() => import('./pages/ClubHistoryPage'))

// Code-split: DistrictClubsPage — district clubs subroute (#570, epic #568 Phase 2)
const DistrictClubsPage = React.lazy(() => import('./pages/DistrictClubsPage'))

const DistrictChangesPage = React.lazy(
  () => import('./pages/DistrictChangesPage')
)

// Code-split: DistrictDivisionsPage — divisions subroute (#571, epic #568 Phase 3)
const DistrictDivisionsPage = React.lazy(
  () => import('./pages/DistrictDivisionsPage')
)

// Code-split: DistrictRankingsPage — rankings subroute (#571, epic #568 Phase 3)
const DistrictRankingsPage = React.lazy(
  () => import('./pages/DistrictRankingsPage')
)

// Code-split: DistrictGridPage — at-a-glance club grid subroute (#1230, epic #1228)
const DistrictGridPage = React.lazy(() => import('./pages/DistrictGridPage'))

// Code-split: DistrictActionListPage — area-director action list (#1231, epic #1228)
const DistrictActionListPage = React.lazy(
  () => import('./pages/DistrictActionListPage')
)

// Code-split: DistrictGrowthPage — Club Growth funnel (#1794, epic #1781)
const DistrictGrowthPage = React.lazy(
  () => import('./pages/DistrictGrowthPage')
)

// Code-split: DistrictSurvivalPage — charter cohort survival, under Growth (#1817)
const DistrictSurvivalPage = React.lazy(
  () => import('./pages/DistrictSurvivalPage')
)
// Code-split: DistrictEducationPage — education awards PYTD (#1793, epic #1781)
const DistrictEducationPage = React.lazy(
  () => import('./pages/DistrictEducationPage')
)
// Code-split: DistrictMeetingsPage — meeting-time heatmap (#1796, epic #1781)
const DistrictMeetingsPage = React.lazy(
  () => import('./pages/DistrictMeetingsPage')
)

// Code-split: DistrictTrendsPage — trends subroute (#680, epic #674 Sprint 6)
// Officer training (#2296) — its own routed subpage, not under Education.
const DistrictTrainingPage = React.lazy(
  () => import('./pages/DistrictTrainingPage')
)
const DistrictTrendsPage = React.lazy(
  () => import('./pages/DistrictTrendsPage')
)

// Code-split: ClubRedirectPage — district-free club URL (#320)
const ClubRedirectPage = React.lazy(() => import('./pages/ClubRedirectPage'))

// Code-split: HistoryPage placeholder (#355) — real content in #367
const HistoryPage = React.lazy(() => import('./pages/HistoryPage'))
// Code-split: worldwide country choropleth, a /history subpage (#1797)
const WorldCountriesPage = React.lazy(
  () => import('./pages/WorldCountriesPage')
)

// Code-split: MethodologyPage placeholder (#355) — real content in #368
const MethodologyPage = React.lazy(() => import('./pages/MethodologyPage'))

// Code-split: AwardsPage — top-10 leaderboards per district award (#370-#373)
const AwardsPage = React.lazy(() => import('./pages/AwardsPage'))

// Clubs worldwide — the race to Distinguished (#1556): hub + one real route
// per tier (ADR-005, no client-side tabs).
const ClubsWorldPage = React.lazy(() => import('./pages/ClubsWorldPage'))
const ClubsRacePage = React.lazy(() => import('./pages/ClubsRacePage'))

// Code-split: McpPage — public MCP-server install page (#1165, epic #1162)
const McpPage = React.lazy(() => import('./pages/McpPage'))

// Code-split: DistrictMapPage — the club map (#1784, epic #1781). Its chunk
// lazy-imports MapLibre (ADR-016); the map route budget is CI-enforced.
const DistrictMapPage = React.lazy(() => import('./pages/DistrictMapPage'))

// Code-split: RegionPage — /region/:n landing (#423)
const RegionPage = React.lazy(() => import('./pages/RegionPage'))

// Code-split: RegionsPage — /regions overview (#496, epic #492)
const RegionsPage = React.lazy(() => import('./pages/RegionsPage'))

// Code-split: region and world rollup subpages (#1815)
const RegionHealthPage = React.lazy(() => import('./pages/RegionHealthPage'))
const WorldHealthPage = React.lazy(() => import('./pages/WorldHealthPage'))
// Code-split: region and world charter cohort survival (#1818)
const RegionSurvivalPage = React.lazy(
  () => import('./pages/RegionSurvivalPage')
)
const WorldSurvivalPage = React.lazy(() => import('./pages/WorldSurvivalPage'))

// Code-split: RegionMapPage — the region club explorer (#1808). Like the
// district map, its chunk lazy-imports MapLibre (ADR-016).
const RegionMapPage = React.lazy(() => import('./pages/RegionMapPage'))
// Code-split: WorldMapPage — the world club explorer (#1809), on the same
// lazy MapLibre chunk.
const WorldMapPage = React.lazy(() => import('./pages/WorldMapPage'))

// Code-split: region education subpage (#1810)
const RegionEducationPage = React.lazy(
  () => import('./pages/RegionEducationPage')
)

// Code-split: world education subpage (#1811)
const WorldEducationPage = React.lazy(
  () => import('./pages/WorldEducationPage')
)

// Code-split: region and world Club Growth funnels (#1812, #1813)
const RegionGrowthPage = React.lazy(() => import('./pages/RegionGrowthPage'))
const WorldGrowthPage = React.lazy(() => import('./pages/WorldGrowthPage'))
// Code-split: region and world meeting-time heatmaps (#1814)
const RegionMeetingsPage = React.lazy(
  () => import('./pages/RegionMeetingsPage')
)
const WorldMeetingsPage = React.lazy(() => import('./pages/WorldMeetingsPage'))

// Code-split: DivisionPage — /district/:districtId/division/:divId (#424)
const DivisionPage = React.lazy(() => import('./pages/DivisionPage'))

// Code-split: AreaPage — /district/:districtId/division/:divId/area/:areaId (#425)
const AreaPage = React.lazy(() => import('./pages/AreaPage'))

// Code-split: AreaRedirectPage — flat alias /district/:districtId/area/:areaId
// → canonical nested area route (#1017)
const AreaRedirectPage = React.lazy(() => import('./pages/AreaRedirectPage'))

/** Loading fallback for lazy-loaded pages */
function PageLoadingFallback(): React.JSX.Element {
  // AppShell owns the <main id="main-content"> landmark; this fallback
  // renders inside it during route-transition Suspense boundaries.
  return (
    <div
      className="tm-container"
      style={{ padding: '2rem', textAlign: 'center' }}
    >
      <div className="tm-loading-spinner" aria-label="Loading page…" />
    </div>
  )
}

/* District route fallback (#1837). Every `/district/:id/*` page renders far
 * past the fold once loaded, but the bare spinner fallback is ~100px tall, so
 * at 1280px the shell footer painted at the bottom of the viewport while the
 * route chunk loaded and was then pushed off-screen when the page mounted
 * (0.04–0.06 CLS on its own). Rendering the fallback inside the page's own
 * root gives it the same reserved minimum height as the page
 * (`.district-detail-page-root` in app-shell.css). */
function DistrictRouteFallback(): React.JSX.Element {
  return (
    <div className="district-detail-page-root">
      <PageLoadingFallback />
    </div>
  )
}

// Create router configuration (ready for v7 future flags when available)
const router = createBrowserRouter(
  [
    {
      path: '/',
      element: <AppShell />,
      // Branded root boundary (#1011): catches unmatched routes (404 bubbles to
      // the nearest errorElement) and any child render throw, so React Router's
      // raw developer default is never reached. Distinguishes 404 vs runtime
      // error via useRouteError/isRouteErrorResponse.
      errorElement: <ErrorPage />,
      children: [
        {
          index: true,
          element: <DistrictsPage />,
        },
        {
          path: 'district/:districtId',
          element: (
            <Suspense
              fallback={
                <DistrictHubRouteFallback
                  fallback={<DistrictRouteFallback />}
                />
              }
            >
              <DistrictDetailPage />
            </Suspense>
          ),
        },
        {
          path: 'district/:districtId/changes',
          element: (
            <Suspense fallback={<DistrictRouteFallback />}>
              <DistrictChangesPage />
            </Suspense>
          ),
        },
        {
          path: 'district/:districtId/clubs',
          element: (
            <Suspense fallback={<DistrictRouteFallback />}>
              <DistrictClubsPage />
            </Suspense>
          ),
        },
        {
          path: 'district/:districtId/divisions',
          element: (
            <Suspense fallback={<DistrictRouteFallback />}>
              <DistrictDivisionsPage />
            </Suspense>
          ),
        },
        {
          path: 'district/:districtId/rankings',
          element: (
            <Suspense fallback={<DistrictRouteFallback />}>
              <DistrictRankingsPage />
            </Suspense>
          ),
        },
        {
          path: 'district/:districtId/grid',
          element: (
            <Suspense fallback={<DistrictRouteFallback />}>
              <DistrictGridPage />
            </Suspense>
          ),
        },
        {
          path: 'district/:districtId/map',
          element: (
            <Suspense fallback={<DistrictRouteFallback />}>
              <DistrictMapPage />
            </Suspense>
          ),
        },
        {
          path: 'district/:districtId/action-list',
          element: (
            <Suspense fallback={<DistrictRouteFallback />}>
              <DistrictActionListPage />
            </Suspense>
          ),
        },
        {
          path: 'district/:districtId/growth',
          element: (
            <Suspense fallback={<DistrictRouteFallback />}>
              <DistrictGrowthPage />
            </Suspense>
          ),
        },
        {
          path: 'district/:districtId/education',
          element: (
            <Suspense fallback={<DistrictRouteFallback />}>
              <DistrictEducationPage />
            </Suspense>
          ),
        },
        {
          path: 'district/:districtId/meetings',
          element: (
            <Suspense fallback={<DistrictRouteFallback />}>
              <DistrictMeetingsPage />
            </Suspense>
          ),
        },
        {
          path: 'district/:districtId/training',
          element: (
            <Suspense fallback={<DistrictRouteFallback />}>
              <DistrictTrainingPage />
            </Suspense>
          ),
        },
        {
          path: 'district/:districtId/growth/survival',
          element: (
            <Suspense fallback={<DistrictRouteFallback />}>
              <DistrictSurvivalPage />
            </Suspense>
          ),
        },
        {
          path: 'district/:districtId/trends',
          element: (
            <Suspense fallback={<DistrictRouteFallback />}>
              <DistrictTrendsPage />
            </Suspense>
          ),
        },
        {
          // The Analytics subpage is retired (#2159): its URL redirects to
          // Clubs sorted by net change (or, for #education-awards, to the
          // Education leaderboards).
          path: 'district/:districtId/analytics',
          element: <DistrictAnalyticsRedirect />,
        },
        {
          path: 'district/:districtId/club/:clubId',
          element: (
            <Suspense fallback={<DistrictRouteFallback />}>
              <ClubDetailPage />
            </Suspense>
          ),
        },
        {
          path: 'district/:districtId/club/:clubId/history',
          element: (
            <Suspense fallback={<DistrictRouteFallback />}>
              <ClubHistoryPage />
            </Suspense>
          ),
        },
        {
          path: 'club/:clubId',
          element: (
            <Suspense fallback={<PageLoadingFallback />}>
              <ClubRedirectPage />
            </Suspense>
          ),
        },
        {
          path: 'history',
          element: (
            <Suspense fallback={<PageLoadingFallback />}>
              <HistoryPage />
            </Suspense>
          ),
        },
        {
          path: 'history/countries',
          element: (
            <Suspense fallback={<PageLoadingFallback />}>
              <WorldCountriesPage />
            </Suspense>
          ),
        },
        {
          path: 'methodology',
          element: (
            <Suspense fallback={<PageLoadingFallback />}>
              <MethodologyPage />
            </Suspense>
          ),
        },
        {
          path: 'awards',
          element: (
            <Suspense fallback={<PageLoadingFallback />}>
              <AwardsPage />
            </Suspense>
          ),
        },
        {
          path: 'clubs',
          element: (
            <Suspense fallback={<PageLoadingFallback />}>
              <ClubsWorldPage />
            </Suspense>
          ),
        },
        {
          // An unknown :tier throws a 404 Response inside the page, which the
          // root errorElement renders as the branded not-found (#1011).
          path: 'clubs/race/:tier',
          element: (
            <Suspense fallback={<PageLoadingFallback />}>
              <ClubsRacePage />
            </Suspense>
          ),
        },
        {
          path: 'mcp',
          element: (
            <Suspense fallback={<PageLoadingFallback />}>
              <McpPage />
            </Suspense>
          ),
        },
        {
          path: 'region/:n',
          element: (
            <CanonicalRegionRoute>
              <Suspense fallback={<PageLoadingFallback />}>
                <RegionPage />
              </Suspense>
            </CanonicalRegionRoute>
          ),
        },
        {
          path: 'regions',
          element: (
            <Suspense fallback={<PageLoadingFallback />}>
              <RegionsPage />
            </Suspense>
          ),
        },
        {
          path: 'region/:n/health',
          element: (
            <CanonicalRegionRoute>
              <Suspense fallback={<PageLoadingFallback />}>
                <RegionHealthPage />
              </Suspense>
            </CanonicalRegionRoute>
          ),
        },
        {
          path: 'region/:n/map',
          element: (
            <CanonicalRegionRoute>
              <Suspense fallback={<PageLoadingFallback />}>
                <RegionMapPage />
              </Suspense>
            </CanonicalRegionRoute>
          ),
        },
        {
          path: 'region/:n/education',
          element: (
            <CanonicalRegionRoute>
              <Suspense fallback={<PageLoadingFallback />}>
                <RegionEducationPage />
              </Suspense>
            </CanonicalRegionRoute>
          ),
        },
        {
          path: 'regions/education',
          element: (
            <Suspense fallback={<PageLoadingFallback />}>
              <WorldEducationPage />
            </Suspense>
          ),
        },
        {
          path: 'regions/map',
          element: (
            <Suspense fallback={<PageLoadingFallback />}>
              <WorldMapPage />
            </Suspense>
          ),
        },
        {
          path: 'regions/health',
          element: (
            <Suspense fallback={<PageLoadingFallback />}>
              <WorldHealthPage />
            </Suspense>
          ),
        },
        {
          path: 'region/:n/growth/survival',
          element: (
            <CanonicalRegionRoute>
              <Suspense fallback={<PageLoadingFallback />}>
                <RegionSurvivalPage />
              </Suspense>
            </CanonicalRegionRoute>
          ),
        },
        {
          path: 'region/:n/growth',
          element: (
            <CanonicalRegionRoute>
              <Suspense fallback={<PageLoadingFallback />}>
                <RegionGrowthPage />
              </Suspense>
            </CanonicalRegionRoute>
          ),
        },
        {
          path: 'regions/growth/survival',
          element: (
            <Suspense fallback={<PageLoadingFallback />}>
              <WorldSurvivalPage />
            </Suspense>
          ),
        },
        {
          path: 'regions/growth',
          element: (
            <Suspense fallback={<PageLoadingFallback />}>
              <WorldGrowthPage />
            </Suspense>
          ),
        },
        {
          path: 'region/:n/meetings',
          element: (
            <CanonicalRegionRoute>
              <Suspense fallback={<PageLoadingFallback />}>
                <RegionMeetingsPage />
              </Suspense>
            </CanonicalRegionRoute>
          ),
        },
        {
          path: 'regions/meetings',
          element: (
            <Suspense fallback={<PageLoadingFallback />}>
              <WorldMeetingsPage />
            </Suspense>
          ),
        },
        {
          path: 'district/:districtId/division/:divId',
          element: (
            <Suspense fallback={<DistrictRouteFallback />}>
              <DivisionPage />
            </Suspense>
          ),
        },
        {
          path: 'district/:districtId/division/:divId/area/:areaId',
          element: (
            <Suspense fallback={<DistrictRouteFallback />}>
              <AreaPage />
            </Suspense>
          ),
        },
        {
          // Flat alias (#1017): /district/:districtId/area/:areaId redirects to
          // the canonical nested route above. Distinct literal segment ('area'
          // vs 'division'/'club') so it never collides with the nested routes.
          path: 'district/:districtId/area/:areaId',
          element: (
            <Suspense fallback={<PageLoadingFallback />}>
              <AreaRedirectPage />
            </Suspense>
          ),
        },
      ],
    },
  ]
  // Future flags will be added when React Router v7 is available:
  // {
  //   future: {
  //     v7_startTransition: true,
  //     v7_relativeSplatPath: true,
  //   }
  // }
)

function App(): React.JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <ProgramYearProvider>
        <DarkModeProvider>
          <RouterProvider router={router} />
        </DarkModeProvider>
      </ProgramYearProvider>
    </QueryClientProvider>
  )
}

export default App
