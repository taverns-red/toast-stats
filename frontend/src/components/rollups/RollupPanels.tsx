import React from 'react'
import type { RegionRollupFigures } from '@taverns-red/shared-contracts'
import { useIsMobile } from '../../hooks/useIsMobile'
import {
  formatShare,
  rollupKpis,
  rollupSections,
  type RollupRow,
  type RollupSection,
} from '../../utils/regionRollupView'

/* RollupPanels (#1815) — one rollup block (#1799) as the hub hierarchy of
   the mobile review §5.5: KPI tiles (2×2 below 768, one row above), then the
   health, status, distinguished and compliance sections. Below 768 each
   section is a disclosure row whose summary carries its headline count; at
   768 and up they are open panels in a grid.

   Program year and date are the page's (R3). A null figure is "Not
   available", never 0. Palette: legacy tokens only (#2080). */

export interface RollupPanelsProps {
  figures: RegionRollupFigures
  /** "YYYY-YYYY", the page's program year (R3). */
  programYear: string
  /** "YYYY-MM-DD", the page's pinned snapshot date (R3). */
  snapshotDate: string
  /** "worldwide" / "in Region 07" — finishes the KPI captions. */
  scopeLabel: string
  /** Rendered between the KPI tiles and the sections ("Needs attention"). */
  attention?: React.ReactNode
}

/** The row each section's phone summary leads with. */
const HEADLINE: Record<RollupSection['id'], string> = {
  health: 'interventionRequired',
  status: 'active',
  distinguished: 'notDistinguished',
  compliance: 'cspSubmitted',
}

const fmt = (n: number): string => n.toLocaleString('en-US')

const RowValue: React.FC<{ row: RollupRow }> = ({ row }) =>
  row.count === null ? (
    <span className="rollup-row__note">{row.note}</span>
  ) : (
    <>
      <span className="rollup-row__count">{fmt(row.count)}</span>
      <span className="rollup-row__share">{formatShare(row.share)}</span>
    </>
  )

const SectionTable: React.FC<{ section: RollupSection }> = ({ section }) => (
  <table className="rollup-table" aria-label={section.title}>
    <thead className="sr-only">
      <tr>
        <th scope="col">Measure</th>
        <th scope="col">Clubs and share</th>
      </tr>
    </thead>
    <tbody>
      {section.rows.map(row => (
        <tr
          key={row.key}
          className="rollup-row"
          data-testid={`rollup-row-${row.key}`}
        >
          <th scope="row" className="rollup-row__label">
            {row.label}
            {row.share !== null && (
              <span className="rollup-row__bar" aria-hidden="true">
                <span
                  className="rollup-row__bar-fill"
                  style={{ width: `${Math.min(100, row.share * 100)}%` }}
                />
              </span>
            )}
          </th>
          <td className="rollup-row__value">
            <RowValue row={row} />
          </td>
        </tr>
      ))}
    </tbody>
  </table>
)

export const RollupPanels: React.FC<RollupPanelsProps> = ({
  figures,
  programYear,
  snapshotDate,
  scopeLabel,
  attention,
}) => {
  const isMobile = useIsMobile(768)
  const kpis = rollupKpis(figures)
  const sections = rollupSections(figures, { programYear, snapshotDate })
  const tiles = [
    { key: 'clubs', label: 'Clubs', value: kpis.clubs },
    { key: 'membership', label: 'Members', value: kpis.membership },
    { key: 'payments', label: 'Payments', value: kpis.payments },
    { key: 'distinguished', label: 'Distinguished', value: kpis.distinguished },
  ]

  return (
    <div className="rollup">
      <ul
        className="rollup-kpis"
        data-testid="rollup-kpis"
        aria-label={`Totals ${scopeLabel}`}
      >
        {tiles.map(t => (
          <li key={t.key} className="rollup-kpi">
            <span className="rollup-kpi__label">{t.label}</span>
            <span className="rollup-kpi__value">{fmt(t.value)}</span>
          </li>
        ))}
      </ul>

      {attention}

      <div className="rollup-sections">
        {sections.map(section => {
          const id = `rollup-${section.id}`
          if (isMobile) {
            const head = section.rows.find(r => r.key === HEADLINE[section.id])
            return (
              <details
                key={section.id}
                id={id}
                className="rollup-section rollup-section--disclosure"
                data-testid={`rollup-section-${section.id}`}
              >
                <summary className="rollup-section__summary">
                  <span className="rollup-section__title">{section.title}</span>
                  {head && (
                    <span className="rollup-section__headline">
                      {head.label}{' '}
                      {head.count === null ? head.note : fmt(head.count)}
                    </span>
                  )}
                </summary>
                <p className="rollup-section__about">{section.about}</p>
                <SectionTable section={section} />
              </details>
            )
          }
          return (
            <section
              key={section.id}
              id={id}
              className="rollup-section"
              aria-labelledby={`${id}-title`}
              data-testid={`rollup-section-${section.id}`}
            >
              <h2 id={`${id}-title`} className="rollup-section__title">
                {section.title}
              </h2>
              <p className="rollup-section__about">{section.about}</p>
              <SectionTable section={section} />
            </section>
          )
        })}
      </div>
    </div>
  )
}

export default RollupPanels
