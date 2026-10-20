import React from 'react'
import { PinSwatch } from './PinSwatch'
import {
  CATEGORICAL8,
  MAP_COLOR_MODES,
  buildModeModel,
  isLazyMode,
  isTerritoryMode,
  type ExtendedMode,
  type MapColorMode,
  type PinCategory,
} from './pinModes'
import { extendedModel } from './pinExtended'

/* The colour-mode picker (#1784, #1787, spec §5): every mode in its group,
   each row with a five-swatch preview of its pins. aria-pressed buttons,
   not tabs. Its own chunk, fetched on mount: the phone's mode sheet and the
   desktop popover both render it, and the map route's first load carries
   only the "Colour" pill and the Health | Distinguished quick toggle. */

/** The territory modes — division and area, the region map's District and
 *  the world map's Region (#1809) — colour each place a categorical hue, so
 *  their preview is the categorical palette, not a model: `extendedModel`
 *  has no bins for them (#2214). */
const isCategoricalMode = (id: MapColorMode) =>
  isTerritoryMode(id) || id === 'district' || id === 'region'

function previewOf(id: MapColorMode): PinCategory[] {
  if (isCategoricalMode(id))
    return CATEGORICAL8.slice(0, 5).map(fill => ({
      key: fill,
      label: '',
      fill,
      shape: 'circle',
    }))
  const model = isLazyMode(id)
    ? extendedModel(id as ExtendedMode, '')
    : buildModeModel(id as 'health' | 'tier')
  return model.categories.slice(0, 5)
}

export type ModeList = readonly (typeof MAP_COLOR_MODES)[number][]

export const ModePicker: React.FC<{
  mode: MapColorMode
  onChange: (m: MapColorMode) => void
  /** The modes on offer: the district map's by default; the region map
   *  passes its own (#1808). */
  modes?: ModeList | undefined
}> = ({ mode, onChange, modes = MAP_COLOR_MODES }) => (
  <div className="map-modes" role="group" aria-label="Colour pins by">
    {[...new Set(modes.map(m => m.group))].map(group => (
      <div
        key={group}
        className="map-modes__group"
        role="group"
        aria-label={group}
      >
        <p className="map-modes__heading" aria-hidden="true">
          {group}
        </p>
        {modes
          .filter(m => m.group === group)
          .map(m => (
            <button
              key={m.id}
              type="button"
              className="map-modes__btn"
              aria-pressed={mode === m.id}
              onClick={() => onChange(m.id)}
            >
              <span className="map-modes__preview" aria-hidden="true">
                {previewOf(m.id).map(c => (
                  <PinSwatch key={c.key} category={c} />
                ))}
              </span>
              {m.label}
            </button>
          ))}
      </div>
    ))}
  </div>
)

/** Desktop: the picker as a popover under the "Colour" pill. Escape or a
 *  click outside closes it and returns focus to the pill. */
export const ModePopover: React.FC<{
  id: string
  mode: MapColorMode
  onChange: (m: MapColorMode) => void
  onClose: () => void
  trigger: React.RefObject<HTMLButtonElement | null>
  modes?: ModeList | undefined
}> = ({ id, mode, onChange, onClose, trigger, modes }) => {
  const ref = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    ref.current
      ?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')
      ?.focus()
    const close = () => {
      onClose()
      trigger.current?.focus()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (!ref.current?.contains(t) && !trigger.current?.contains(t)) onClose()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [onClose, trigger])
  return (
    <div id={id} ref={ref} className="map-modes-pop">
      <ModePicker mode={mode} onChange={onChange} modes={modes} />
    </div>
  )
}

export default ModePicker
