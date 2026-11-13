import React from 'react'

/* The one KPI tile (#2649, Fable 5.2 UX review HUB-06 / HUB-14).

   Label first, the figure under it, an optional hint last. Styles live in
   styles/components/stat-tile.css: a label reserves two lines, so when one
   tile's label wraps the figures in the row still start at the same height.

   `family` is the BEM root a tile family already used ('education-kpi',
   'meetings-kpi', ...). It is emitted next to the shared classes so existing
   selectors (e2e, tests, a family's own column rules) keep resolving. */

export interface StatTileProps {
  /** Family BEM root, e.g. 'education-kpi'. */
  family: string
  label: React.ReactNode
  /** The figure. May be rich (a link); it is wrapped in the value element. */
  value: React.ReactNode
  hint?: React.ReactNode | undefined
  /** Extra class(es) on the figure, e.g. a muted "not measured" state. */
  valueClassName?: string | undefined
  /** Extra class(es) on the tile, e.g. a family modifier. */
  className?: string | undefined
}

const join = (...parts: (string | undefined)[]): string =>
  parts.filter(Boolean).join(' ')

export const StatTile: React.FC<StatTileProps> = ({
  family,
  label,
  value,
  hint,
  valueClassName,
  className,
}) => (
  <li className={join('stat-tile', family, className)}>
    <span className={join('stat-tile__label', `${family}__label`)}>
      {label}
    </span>
    <span
      className={join('stat-tile__value', `${family}__value`, valueClassName)}
    >
      {value}
    </span>
    {hint != null && hint !== false && (
      <span className={join('stat-tile__hint', `${family}__hint`)}>{hint}</span>
    )}
  </li>
)

export interface StatTileListProps {
  /** Family strip class, e.g. 'education-kpis' (carries its column counts). */
  family: string
  'aria-label'?: string
  'data-testid'?: string
  children: React.ReactNode
}

/** The list that holds a row of StatTiles. */
export const StatTileList: React.FC<StatTileListProps> = ({
  family,
  children,
  ...rest
}) => (
  <ul className={join('stat-tiles', family)} {...rest}>
    {children}
  </ul>
)
