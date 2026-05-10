import React from 'react'
import ThemeToggle from '../ThemeToggle'

declare const __APP_VERSION__: string

/**
 * Minimalist footer per the 2026 design handoff (#354).
 *
 * Two-column flex, 12px text, top border. Left = attribution; right =
 * data source + license + version. Theme toggle preserved on the right
 * for manual dark-mode access (the redesign drops it visually but the
 * accessibility need stays — see Epic #352 scope decisions).
 */

const AppShellFooter: React.FC = () => {
  const version =
    typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'

  return (
    <footer
      role="contentinfo"
      className="border-t"
      style={{
        borderColor: 'var(--line)',
        backgroundColor: 'var(--surface)',
        color: 'var(--ink-3)',
      }}
    >
      <div
        className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 max-w-[1280px] mx-auto px-6 py-4"
        style={{ fontFamily: 'var(--sans)', fontSize: 12 }}
      >
        <div>Toast Stats · ts.taverns.red · A Red Taverns production</div>
        <div className="flex items-center gap-2">
          <span data-testid="app-version">
            Data:{' '}
            <a
              href="https://dashboards.toastmasters.org"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--link)' }}
            >
              dashboards.toastmasters.org
            </a>
            {' · '}
            <a
              href="https://github.com/taverns-red/toast-stats/blob/main/LICENSE"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--link)' }}
            >
              MIT License
            </a>
            {' · v'}
            {version}
          </span>
          <ThemeToggle />
        </div>
      </div>
    </footer>
  )
}

export default AppShellFooter
