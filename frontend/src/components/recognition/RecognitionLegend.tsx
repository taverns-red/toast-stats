import React, { useId, useState } from 'react'
import { RecognitionBadge } from './RecognitionBadge'
import {
  AWARD_RECOGNITION,
  TIER_RECOGNITION,
  type RecognitionItem,
} from './recognitionRegistry'

/**
 * The key for the recognition badges (#1361).
 *
 * There was previously nothing anywhere on the landing page explaining what a
 * badge meant. But the legend must not eat the mobile fold (gap (c) on
 * #1359), so:
 *   - ≥640px it renders INLINE and the disclosure button is `display: none`;
 *   - below 640px it collapses behind "What do these badges mean?".
 *
 * That switch is pure CSS (see `.recognition-legend` in app-shell.css and
 * `recognitionLegend.guard.test.ts`) — both branches are always in the DOM, so
 * there is no data-dependent insert and nothing for the layout to shift
 * around. The component itself needs no data, which is why the loading shell
 * can reserve its slot with the REAL component rather than a placeholder.
 *
 * The groups are not cosmetic: the awards are independent of one another
 * (three glyphs) while the tiers are a single ordinal ladder (one rosette,
 * four colours). Saying so in the legend is how a reader learns to read the
 * badges rather than memorising seven of them.
 */
const GROUPS: ReadonlyArray<{
  heading: string
  hint: string
  items: readonly RecognitionItem[]
}> = [
  {
    heading: 'Awards',
    hint: 'won independently',
    items: AWARD_RECOGNITION,
  },
  {
    heading: 'Distinguished tiers',
    hint: 'one ladder, lowest to highest',
    items: TIER_RECOGNITION,
  },
]

export const RecognitionLegend: React.FC = () => {
  const [open, setOpen] = useState(false)
  const itemsId = useId()

  return (
    <div className="recognition-legend">
      <button
        type="button"
        className="recognition-legend__toggle"
        aria-expanded={open}
        aria-controls={itemsId}
        onClick={() => setOpen(v => !v)}
      >
        <span aria-hidden="true" className="recognition-legend__caret">
          {open ? '▾' : '▸'}
        </span>
        What do these badges mean?
      </button>
      <div
        id={itemsId}
        className="recognition-legend__items"
        data-open={String(open)}
      >
        <span className="recognition-legend__title">Recognition</span>
        {GROUPS.map(group => (
          <div className="recognition-legend__group" key={group.heading}>
            <span className="recognition-legend__group-heading">
              {group.heading}
              <span className="recognition-legend__group-hint">
                {' '}
                · {group.hint}
              </span>
            </span>
            <ul className="recognition-legend__list">
              {group.items.map(item => (
                <li className="recognition-legend__item" key={item.id}>
                  <RecognitionBadge item={item} decorative />
                  <span className="recognition-legend__term">{item.title}</span>
                  <span className="recognition-legend__desc">
                    {item.description}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}

export default RecognitionLegend
