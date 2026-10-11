import React from 'react'

/* #1832 — 24px stroke icons for the phone bottom section bar. Decorative:
   every bar item also has a visible text label, so these are aria-hidden. */

const Icon: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    {children}
  </svg>
)

export const OverviewIcon: React.FC = () => (
  <Icon>
    <path d="M3 11l9-7 9 7" />
    <path d="M5 10v10h14V10" />
  </Icon>
)

export const ClubsIcon: React.FC = () => (
  <Icon>
    <circle cx="9" cy="8" r="3" />
    <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
    <path d="M16 5.5a3 3 0 010 5" />
    <path d="M18 14.5c1.8.8 3 2.6 3 4.5" />
  </Icon>
)

export const DivisionsIcon: React.FC = () => (
  <Icon>
    <path d="M12 3l9 5-9 5-9-5 9-5z" />
    <path d="M3 13l9 5 9-5" />
  </Icon>
)

export const TrendsIcon: React.FC = () => (
  <Icon>
    <path d="M3 17l6-6 4 4 8-8" />
    <path d="M15 7h6v6" />
  </Icon>
)
