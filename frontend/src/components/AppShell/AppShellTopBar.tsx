import React from 'react'
import { NavLink, Link } from 'react-router-dom'

/**
 * Sticky top bar for the redesign chrome (#354).
 *
 * Layout: brand mark on the left, primary nav on the right.
 * Per Epic #352: Regions/Awards omitted; no notifications/help/avatar.
 */

const NAV_ITEMS = [
  { to: '/', label: 'Districts', end: true },
  { to: '/history', label: 'History', end: false },
  { to: '/methodology', label: 'Methodology', end: false },
] as const

const AppShellTopBar: React.FC = () => {
  return (
    <header
      className="sticky top-0 z-40 border-b"
      style={{
        height: 56,
        borderColor: 'var(--line)',
        backgroundColor: 'rgba(255, 255, 255, 0.72)',
        backdropFilter: 'saturate(140%) blur(8px)',
        WebkitBackdropFilter: 'saturate(140%) blur(8px)',
      }}
    >
      <div className="flex items-center justify-between h-full px-6 max-w-[1280px] mx-auto">
        <Link
          to="/"
          aria-label="Toast Stats home"
          className="flex items-center gap-2 no-underline"
          style={{ color: 'var(--ink)' }}
        >
          <span
            aria-hidden="true"
            className="inline-flex items-center justify-center"
            style={{
              width: 24,
              height: 24,
              borderRadius: 'var(--rds-radius-sm)',
              backgroundColor: 'var(--loyal-500)',
              color: '#ffffff',
              fontFamily: 'var(--serif)',
              fontWeight: 800,
              fontSize: 11,
              letterSpacing: '-0.02em',
            }}
          >
            TS
          </span>
          <span
            style={{
              fontFamily: 'var(--serif)',
              fontWeight: 700,
              fontSize: 15,
              letterSpacing: '-0.01em',
            }}
          >
            Toast Stats
          </span>
        </Link>

        <nav aria-label="Primary" className="flex items-center gap-1">
          {NAV_ITEMS.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className="px-3 py-1.5 rounded-md transition-colors no-underline"
              style={({ isActive }) => ({
                fontFamily: 'var(--sans)',
                fontWeight: 500,
                fontSize: 13.5,
                color: isActive ? 'var(--loyal-500)' : 'var(--ink-2)',
                backgroundColor: isActive ? 'var(--loyal-50)' : 'transparent',
              })}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  )
}

export default AppShellTopBar
