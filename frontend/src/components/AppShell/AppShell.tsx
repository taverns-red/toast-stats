/**
 * AppShell — shared chrome for every redesign route (#354).
 *
 * Renders the sticky top bar (brand mark + primary nav), a skip link,
 * the routed page in <main id="main-content">, and the minimalist
 * footer specified in the 2026 design handoff.
 *
 * Per Epic #352 scope: no notifications/help/avatar (no auth today),
 * no Regions/Awards "soon" stubs (omitted entirely until shipped).
 *
 * The DarkModeProvider wrapped around the app supplies the theme
 * toggle's state — kept in the footer for manual dark-mode access.
 */

import React from 'react'
import { Outlet } from 'react-router-dom'
import AppShellTopBar from './AppShellTopBar'
import AppShellFooter from './AppShellFooter'

const AppShell: React.FC = () => {
  return (
    <div
      className="flex flex-col min-h-screen"
      style={{ backgroundColor: 'var(--bg)', color: 'var(--ink)' }}
    >
      <a href="#main-content" className="tm-skip-link">
        Skip to main content
      </a>
      <AppShellTopBar />
      <main id="main-content" className="flex-1">
        <Outlet />
      </main>
      <AppShellFooter />
    </div>
  )
}

export default AppShell
