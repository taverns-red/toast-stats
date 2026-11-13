import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import ThemeToggle from '../ThemeToggle'
import AppMeta from './AppMeta'
import HeaderSearch from './HeaderSearch'
import { useIsMobile } from '../../hooks/useIsMobile'
import { lockScroll } from '../../utils/scrollLock'

/* Each item is active for the section its URL is in, not only its own `to`
   (#2646): /district/* is Districts, /region/* and /regions/* are Regions.
   `sections` are path prefixes matched on a segment boundary. NavLink cannot
   do this: its aria-current follows its own `to` alone. */
const NAV_ITEMS = [
  { to: '/', label: 'Districts', sections: ['/district'], home: true },
  { to: '/regions', label: 'Regions', sections: ['/region', '/regions'] },
  { to: '/awards', label: 'Awards', sections: ['/awards'] },
  { to: '/clubs', label: 'Clubs', sections: ['/clubs'] },
  { to: '/history', label: 'History', sections: ['/history'] },
  { to: '/methodology', label: 'How it works', sections: ['/methodology'] },
] as const

type NavItem = (typeof NAV_ITEMS)[number]

const isNavItemActive = (item: NavItem, pathname: string): boolean =>
  ('home' in item && pathname === '/') ||
  item.sections.some(s => pathname === s || pathname.startsWith(`${s}/`))

const PRIMARY_NAV_ID = 'app-shell-primary-nav'

interface AppShellTopBarProps {
  /** Open the modal palette — the mobile search icon's target, shared with Cmd-K. */
  onOpenSearch: () => void
}

const AppShellTopBar: React.FC<AppShellTopBarProps> = ({ onOpenSearch }) => {
  // Mobile (<768px) disclosure: the primary nav collapses behind a
  // hamburger toggle so the 56px bar stops overflowing the viewport at
  // 375px (#735). On desktop the nav is always inline and `navOpen` is
  // inert — CSS shows the row and hides the toggle.
  const [navOpen, setNavOpen] = useState(false)
  const closeNav = useCallback(() => setNavOpen(false), [])
  const headerRef = useRef<HTMLElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const location = useLocation()

  // <768px the footer chrome is dropped (#889); its version/license meta
  // moves here behind a collapsed-by-default "About ▾" disclosure. Desktop
  // keeps the footer, so this control is absent there entirely.
  const isMobile = useIsMobile(768)

  // Close on route change — covers browser back/forward, not just link taps
  // (link taps also call closeNav). React's sanctioned "adjust state when a
  // value changes during render" pattern (a tracked-state compare, not a
  // setState-in-effect which would cascade-render, nor a ref read in render).
  const [trackedPath, setTrackedPath] = useState(location.pathname)
  if (trackedPath !== location.pathname) {
    setTrackedPath(location.pathname)
    setNavOpen(false)
  }

  // Escape closes; outside-click closes. Bound only while open so we
  // don't keep idle global listeners on every page.
  useEffect(() => {
    if (!navOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setNavOpen(false)
        // Focus would otherwise fall to <body> as the link it was on hides.
        toggleRef.current?.focus({ preventScroll: true })
      }
    }
    const onPointerDown = (e: MouseEvent) => {
      if (!headerRef.current?.contains(e.target as Node)) setNavOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('mousedown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('mousedown', onPointerDown)
    }
  }, [navOpen])

  // Lock page scroll while the phone menu is open (#2638): it scrolls inside
  // itself when taller than the viewport, and the page must not move behind.
  useEffect(() => {
    if (!navOpen || !isMobile) return
    return lockScroll()
  }, [navOpen, isMobile])

  // The Search button sits inside the header, so tapping it would leave the
  // menu open under the palette: close the menu as the palette opens.
  const openSearch = useCallback(() => {
    setNavOpen(false)
    onOpenSearch()
  }, [onOpenSearch])

  return (
    <header className="app-shell-top-bar" ref={headerRef}>
      <button
        ref={toggleRef}
        type="button"
        className="app-shell-nav-toggle"
        aria-label={navOpen ? 'Close menu' : 'Open menu'}
        aria-controls={PRIMARY_NAV_ID}
        aria-expanded={navOpen}
        onClick={() => setNavOpen(prev => !prev)}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          aria-hidden="true"
        >
          {navOpen ? (
            <>
              <path d="M5 5l10 10" />
              <path d="M15 5L5 15" />
            </>
          ) : (
            <>
              <path d="M3 6h14" />
              <path d="M3 10h14" />
              <path d="M3 14h14" />
            </>
          )}
        </svg>
      </button>

      <Link to="/" aria-label="Toast Stats home" className="app-shell-brand">
        <span aria-hidden="true" className="app-shell-brand__mark">
          {/* Red Taverns pennant (taverns-red/ops docs/brand/pennant.svg, RT
              outlined as in favicon.svg). Brand colours stay inside the mark. */}
          <svg
            data-testid="brand-pennant"
            aria-hidden="true"
            focusable="false"
            viewBox="0 0 140 100"
            width="24"
            height="17"
          >
            <path d="M0 0 H120 L140 50 L120 100 H0 Z" fill="#E63946" />
            <path
              d="M27.64 74V30.6H46.49Q50.58 30.6 53.62 32.03Q56.66 33.45 58.33 36.06Q60.01 38.66 60.01 42.19V42.94Q60.01 46.84 58.15 49.26Q56.29 51.68 53.56 52.8V53.91Q56.04 54.04 57.4 55.62Q58.77 57.2 58.77 59.8V74H50.58V60.98Q50.58 59.49 49.81 58.56Q49.03 57.63 47.24 57.63H35.83V74ZM35.83 50.19H45.62Q48.54 50.19 50.18 48.61Q51.82 47.03 51.82 44.43V43.81Q51.82 41.2 50.21 39.62Q48.6 38.04 45.62 38.04H35.83ZM73.13 74V38.04H60.48V30.6H93.96V38.04H81.31V74Z"
              fill="#F4F1EB"
            />
          </svg>
        </span>
        <span className="app-shell-brand__name">Toast Stats</span>
      </Link>

      <nav
        id={PRIMARY_NAV_ID}
        aria-label="Primary"
        className="app-shell-nav"
        data-open={navOpen}
      >
        {NAV_ITEMS.map(item => (
          <Link
            key={item.to}
            to={item.to}
            className="app-shell-nav__link"
            aria-current={
              isNavItemActive(item, location.pathname) ? 'page' : undefined
            }
            onClick={closeNav}
          >
            {item.label}
          </Link>
        ))}
        {isMobile && (
          <details className="app-shell-nav-about">
            <summary className="app-shell-nav__link app-shell-nav-about__summary">
              About
            </summary>
            <div className="app-shell-nav-about__content">
              <AppMeta />
            </div>
          </details>
        )}
      </nav>

      <div className="app-shell-tools">
        {/* Omni-search (#1058): inline combobox on desktop, icon→modal on
            mobile. Cmd-K opens the same modal everywhere (AppShell). */}
        <HeaderSearch onOpenSearch={openSearch} />
        {/* Bell stub removed per #411 — a non-functional icon erodes
            trust. Re-add when there's real notification content. */}
        <Link
          to="/methodology"
          className="app-shell-icon-btn app-shell-help"
          aria-label="How it works"
          title="How it works"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <circle cx="8" cy="8" r="6.5" />
            <path d="M6.2 6.2a1.8 1.8 0 1 1 2.4 1.7c-.5.2-.6.5-.6.9V10" />
            <circle cx="8" cy="12" r=".4" fill="currentColor" />
          </svg>
        </Link>
        <ThemeToggle />
        <span
          className="app-shell-avatar"
          aria-label="Account (placeholder)"
          role="img"
        >
          TS
        </span>
      </div>
    </header>
  )
}

export default AppShellTopBar
