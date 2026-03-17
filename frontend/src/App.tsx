import React, { Suspense } from 'react'
import { createBrowserRouter, RouterProvider, Outlet } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './config/queryClient'
import { ProgramYearProvider } from './contexts/ProgramYearContext'
import { DarkModeProvider } from './contexts/DarkModeContext'
import LandingPage from './pages/LandingPage'
import SiteFooter from './components/SiteFooter'

// Code-split: DistrictDetailPage (816 lines + recharts) loads on navigation (#169)
const DistrictDetailPage = React.lazy(
  () => import('./pages/DistrictDetailPage')
)

/** Loading fallback for lazy-loaded pages */
function PageLoadingFallback(): React.JSX.Element {
  return (
    <main
      id="main-content"
      className="tm-container"
      style={{ padding: '2rem', textAlign: 'center' }}
    >
      <div className="tm-loading-spinner" aria-label="Loading page…" />
    </main>
  )
}

function Layout(): React.JSX.Element {
  return (
    <>
      <a href="#main-content" className="tm-skip-link">
        Skip to main content
      </a>
      <Outlet />
      <SiteFooter />
    </>
  )
}

// Create router configuration (ready for v7 future flags when available)
const router = createBrowserRouter(
  [
    {
      path: '/',
      element: <Layout />,
      children: [
        {
          index: true,
          element: <LandingPage />,
        },
        {
          path: 'district/:districtId',
          element: (
            <Suspense fallback={<PageLoadingFallback />}>
              <DistrictDetailPage />
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
