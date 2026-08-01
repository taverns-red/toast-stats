import React from 'react'
import { Link } from 'react-router-dom'

declare const __APP_VERSION__: string

/* The site meta strip — attribution, data source, license, build version.
   Rendered by the desktop footer (AppShellFooter) and, on mobile where the
   footer is dropped, behind the "About ▾" nav disclosure (AppShellTopBar,
   #889). Single source so the version logic and license URL never drift. */

const AppMeta: React.FC = () => {
  const version =
    typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'

  return (
    <>
      <div>
        Toast Stats · ts.taverns.red · A{' '}
        <a
          href="https://taverns.red?utm_source=toast-stats&utm_medium=footer"
          target="_blank"
          rel="noopener noreferrer"
          className="app-shell-footer__link"
        >
          Red Taverns
        </a>{' '}
        production
      </div>
      <div className="app-shell-footer__meta">
        <span data-testid="app-version">
          Data:{' '}
          <a
            href="https://dashboards.toastmasters.org"
            target="_blank"
            rel="noopener noreferrer"
            className="app-shell-footer__link"
          >
            dashboards.toastmasters.org
          </a>
          {' · '}
          {/* /mcp entry point (#1165): AppMeta renders in both the desktop
              footer and the mobile "About ▾" disclosure (#889), so this one
              link covers every page at every breakpoint. Placed before the
              license so the "MIT License · <version>" slot pairing the
              version guard asserts on stays adjacent. */}
          <Link to="/mcp" className="app-shell-footer__link">
            MCP server
          </Link>
          {' · '}
          {/* The only contact path in the app (#1356). There is no backend to
              POST a form to, so this goes to the GitHub issue chooser, whose
              bug/feature templates live in .github/ISSUE_TEMPLATE/. Same
              placement reasoning as the /mcp link above: it sits BEFORE the
              license so the "MIT License · <version>" pairing stays adjacent
              for the version guard. */}
          <a
            href="https://github.com/taverns-red/toast-stats/issues/new/choose"
            target="_blank"
            rel="noopener noreferrer"
            className="app-shell-footer__link"
          >
            Report an issue
          </a>
          {' · '}
          <a
            href="https://github.com/taverns-red/toast-stats/blob/main/LICENSE"
            target="_blank"
            rel="noopener noreferrer"
            className="app-shell-footer__link"
          >
            MIT License
          </a>
          {' · '}
          {version}
        </span>
      </div>
    </>
  )
}

export default AppMeta
