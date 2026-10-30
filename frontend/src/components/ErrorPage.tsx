import React, { useEffect, useRef } from 'react'
import {
  Link,
  useNavigate,
  useRouteError,
  useLocation,
  isRouteErrorResponse,
} from 'react-router-dom'
import { logger } from '../utils/logger'
import { useDistricts } from '../hooks/useDistricts'
import { resolveRouteRecovery } from '../utils/errorRecovery'
import {
  browserNav,
  isChunkLoadError,
  recoverFromChunkError,
} from '../utils/chunkReload'

/**
 * Root `errorElement` for the router (#1011, epic #1010 Sprint 1).
 *
 * Replaces React Router's raw developer default ("Unexpected Application
 * Error! … Hey developer 👋 You can provide a way better UX…") with a calm,
 * branded page for the two failure modes that bubble to the root route:
 *   - an unmatched route → a 404 `ErrorResponse` (no route matched)
 *   - any child route that throws at render → a runtime error
 *
 * `useRouteError()` + `isRouteErrorResponse()` distinguish the two: a 404 gets
 * "page not found" copy, anything else gets "something went wrong". Both share
 * the same chrome and the same Home + Back recovery. It renders standalone
 * (the errorElement replaces `AppShell`, so the shell — which could itself be
 * what threw — is not re-mounted); the dark-mode-aware tokens + `redesign-panel`
 * surface give it the product look without rebuilding the nav.
 *
 * Sprint 2 (#1012) adds route-aware smart recovery: for a malformed
 * `/district/:id` 404 it suggests that district's real subpages (valid id) or
 * the districts index (unknown id). See `utils/errorRecovery.ts`.
 *
 * Stale build (#2415): after a deploy, a tab on the old build fails to load a
 * lazy route chunk that no longer exists, and that rejection lands here. For
 * a chunk-load error the page reloads the target URL once, only if a newer
 * build is deployed (guarded, see `utils/chunkReload.ts`), and leads with Reload and "new version" copy; if
 * the guard refuses (the chunk still fails after the reload) the page stays
 * up with the manual Reload. Every variant also offers Reload.
 */
const ErrorPage: React.FC = () => {
  const error = useRouteError()
  const navigate = useNavigate()
  const location = useLocation()
  const headingRef = useRef<HTMLHeadingElement>(null)

  // React Router wraps a *loader/action*-thrown Response into an ErrorResponse
  // (caught by isRouteErrorResponse), but a *render*-thrown Response — the shape
  // the scoped Division/Area pages use for a bad slug (#1017) — arrives raw. Map
  // both to a status so either route to a 404 lands on the branded not-found
  // page rather than the generic "something went wrong".
  const errorResponse: { status: number; statusText: string } | null =
    isRouteErrorResponse(error)
      ? error
      : error instanceof Response
        ? error
        : null
  const is404 = errorResponse?.status === 404
  const isChunkError = !errorResponse && isChunkLoadError(error)
  const variant = is404 ? 'not-found' : isChunkError ? 'chunk-load' : 'error'

  // The URL the user was navigating to: the router's location is the target
  // (it was pushed before the lazy route rendered). Absolute, so the reload
  // compares cleanly with window.location.href.
  const targetHref = new URL(
    `${location.pathname}${location.search}${location.hash}`,
    window.location.origin
  ).href

  // Route-aware smart recovery (#1012). useRouteError exposes no attempted URL,
  // so we read the unmatched path from useLocation and validate the district id
  // against the known set (useDistricts). Only meaningful for a 404 — a runtime
  // error fired from a route that DID match needs generic Home + Back, not
  // "did you mean these subpages". ErrorPage is always rendered under App's
  // QueryClientProvider, so useDistricts is safe here.
  const { data: districtsData } = useDistricts()
  const recovery = is404
    ? resolveRouteRecovery(
        location.pathname,
        districtsData?.districts.map(d => d.id) ?? []
      )
    : { kind: 'none' as const, suggestions: [] }
  const hasSuggestions = recovery.suggestions.length > 0

  // Log genuine runtime errors for telemetry; a 404 is expected user navigation
  // (mistyped URL / dead link), not an error worth recording.
  useEffect(() => {
    if (!is404) {
      logger.error('Route error boundary caught:', error)
    }
  }, [error, is404])

  // Self-heal a stale build (#2415): one guarded full reload of the target.
  useEffect(() => {
    if (isChunkError) void recoverFromChunkError(targetHref)
  }, [isChunkError, targetHref])

  // Move focus to the heading on mount so screen-reader and keyboard users land
  // on the error context immediately rather than at the top of a replaced tree.
  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  const heading = is404
    ? 'Page not found'
    : isChunkError
      ? 'A new version of Toast Stats is available'
      : 'Something went wrong'
  const message = is404
    ? "We couldn't find the page you're looking for. It may have moved, or the link you followed may be broken."
    : isChunkError
      ? 'Toast Stats was updated while this tab was open, so this page could not load. Reload to get the latest version.'
      : 'An unexpected error stopped this page from loading. You can reload, go back to the previous page, or head home and start again.'

  const reload = (): void => browserNav.reloadTo(targetHref)

  // Surface technical detail only in development — never leak a stack trace or
  // framework internals to real users in production.
  const detail = import.meta.env.DEV
    ? errorResponse
      ? `${errorResponse.status} ${errorResponse.statusText}`
      : error instanceof Error
        ? error.message
        : null
    : null

  return (
    <div
      className="error-page"
      data-testid="error-page"
      data-error-variant={variant}
    >
      <div className="error-page__panel redesign-panel">
        {/* role=alert announces the error context on mount; scope it to the
            message region so the recovery buttons below aren't read as part of
            the live region (they're separately focusable affordances). */}
        <div role="alert">
          <div className="error-page__badge" aria-hidden="true">
            {is404 ? (
              <span className="error-page__code">404</span>
            ) : isChunkError ? (
              <svg
                className="error-page__glyph"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            ) : (
              <svg
                className="error-page__glyph"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            )}
          </div>

          <h1 ref={headingRef} tabIndex={-1} className="error-page__heading">
            {heading}
          </h1>

          <p className="error-page__message">{message}</p>

          {detail && (
            <p className="error-page__detail" data-testid="error-page-detail">
              {detail}
            </p>
          )}
        </div>

        {hasSuggestions && (
          <nav
            className="error-page__suggestions"
            data-testid="error-page-suggestions"
            aria-label="Suggested destinations"
          >
            <p className="error-page__suggestions-lead">
              {recovery.kind === 'district-subpages'
                ? `Did you mean one of District ${recovery.districtId}'s pages?`
                : 'Try browsing from the districts list:'}
            </p>
            <ul className="error-page__suggestions-list">
              {recovery.suggestions.map(({ label, to }) => (
                <li key={to} className="error-page__suggestions-item">
                  <Link to={to} className="error-page__suggestion-link">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}

        <div className="error-page__actions">
          {isChunkError ? (
            <>
              <button
                type="button"
                onClick={reload}
                className="tm-btn-primary error-page__action"
              >
                Reload
              </button>
              <Link to="/" className="tm-btn-secondary error-page__action">
                Go home
              </Link>
            </>
          ) : (
            <>
              <Link to="/" className="tm-btn-primary error-page__action">
                Go home
              </Link>
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="tm-btn-secondary error-page__action"
              >
                Go back
              </button>
              <button
                type="button"
                onClick={reload}
                className="tm-btn-secondary error-page__action"
              >
                Reload
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default ErrorPage
