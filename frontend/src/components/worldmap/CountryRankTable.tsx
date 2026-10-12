import React from 'react'
import type { ChoroplethView } from './countryChoroplethView'
import { CHOROPLETH_THEME } from './choroplethScale'

/* Ranked clubs-by-country table for the choropleth (#1797).

   The keyboard and screen-reader path to every value the map colours: each
   placeable country is a toggle button that selects it on the map. A country
   the map cannot place is still listed, flagged "not on map". The Unknown
   residual closes the table, stated against the same whole as every share. */

export interface CountryRankTableProps {
  view: ChoroplethView
  /** ISO numeric code of the selected country, or null. */
  selectedId: string | null
  onSelect: (isoId: string) => void
  /** Show only the top N countries (Unknown still closes the table). */
  limit?: number | undefined
  theme?: 'light' | 'dark'
  id?: string
}

const NUM = new Intl.NumberFormat('en-US')

export const CountryRankTable: React.FC<CountryRankTableProps> = ({
  view,
  selectedId,
  onSelect,
  limit,
  theme = 'light',
  id,
}) => {
  const fills = CHOROPLETH_THEME[theme].fills
  const rows = limit === undefined ? view.rows : view.rows.slice(0, limit)

  return (
    <table className="wm-table" id={id}>
      <caption className="wm-table__caption">
        Clubs by country, ranked
        {limit !== undefined && limit < view.rows.length
          ? ` (top ${limit} of ${view.rows.length})`
          : ''}
      </caption>
      <thead>
        <tr>
          <th scope="col" className="wm-table__rank">
            #
          </th>
          <th scope="col">Country</th>
          <th scope="col" className="wm-table__num">
            Clubs
          </th>
          <th scope="col" className="wm-table__num">
            Share
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map(row => {
          const selected = row.isoId !== null && row.isoId === selectedId
          return (
            <tr
              key={row.name}
              data-testid={`wm-row-${row.isoId ?? row.name}`}
              className={selected ? 'wm-table__row--selected' : undefined}
            >
              <td className="wm-table__rank">{row.rank}</td>
              <th scope="row" className="wm-table__country">
                {row.placement !== 'none' && row.isoId ? (
                  <button
                    type="button"
                    className="wm-table__select"
                    aria-pressed={selected}
                    aria-label={`Show ${row.name} on the map`}
                    onClick={() => onSelect(row.isoId!)}
                  >
                    <span
                      className="wm-table__swatch"
                      style={{
                        background: row.bin !== null ? fills[row.bin] : 'none',
                      }}
                      aria-hidden="true"
                    />
                    {row.name}
                  </button>
                ) : (
                  <span className="wm-table__unplaced">
                    {row.name}{' '}
                    <span className="wm-table__note">(not on map)</span>
                  </span>
                )}
              </th>
              <td className="wm-table__num">{NUM.format(row.clubs)}</td>
              <td className="wm-table__num">{row.sharePct}%</td>
            </tr>
          )
        })}
        <tr data-testid="wm-row-unknown" className="wm-table__row--unknown">
          <td className="wm-table__rank" />
          <th scope="row" className="wm-table__country">
            Unknown
          </th>
          <td className="wm-table__num">{NUM.format(view.unknown.clubs)}</td>
          <td className="wm-table__num">{view.unknown.sharePct}%</td>
        </tr>
      </tbody>
    </table>
  )
}

export default CountryRankTable
