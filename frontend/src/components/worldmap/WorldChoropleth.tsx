import React, { useId, useMemo, useRef, useState } from 'react'
import type { WorldGeometry } from './worldGeometry'
import type { ChoroplethRow, ChoroplethView } from './countryChoroplethView'
import { CHOROPLETH_BINS, CHOROPLETH_THEME } from './choroplethScale'

/* Worldwide country choropleth (#1797, epic #1781).

   Plain SVG over a pre-projected Equal Earth world (see worldGeometry.ts):
   an equal-area projection, so the ink a country gets is in proportion to
   its area, and no map library on the route. The map is one labelled image
   for assistive tech; the values live in the ranked table the page renders
   beside or below it (the keyboard and screen-reader path). Pointer users
   hover or tap a country to read its value; tapping selects it, and the page
   keeps the selection in the URL.

   Zoom and pan change the SVG viewBox: + / − / whole-world buttons, drag to
   pan, two-finger pinch. Selecting a small country zooms to it. */

type Theme = 'light' | 'dark'

export interface WorldChoroplethProps {
  geometry: WorldGeometry
  view: ChoroplethView
  theme: Theme
  /** ISO numeric code of the selected country, or null. */
  selectedId: string | null
  onSelect: (isoId: string | null) => void
}

interface Box {
  x: number
  y: number
  w: number
  h: number
}

const ZOOM_STEP = 1.6
const MAX_ZOOM = 12
const NUM = new Intl.NumberFormat('en-US')

function clampBox(b: Box, W: number, H: number): Box {
  const w = Math.min(W, Math.max(W / MAX_ZOOM, b.w))
  const h = (w * H) / W
  return {
    w,
    h,
    x: Math.min(W - w, Math.max(0, b.x)),
    y: Math.min(H - h, Math.max(0, b.y)),
  }
}

function zoomAround(b: Box, factor: number, cx: number, cy: number): Box {
  const w = b.w / factor
  const h = b.h / factor
  return {
    w,
    h,
    x: cx - ((cx - b.x) * w) / b.w,
    y: cy - ((cy - b.y) * h) / b.h,
  }
}

/** The view that frames a small selected country, or null to keep the view. */
function selectionBox(
  id: string | null,
  shapes: Map<string, { b: number[] }>,
  markers: Map<string, { x: number; y: number }>,
  W: number,
  H: number
): Box | null {
  if (!id) return null
  const shape = shapes.get(id)
  const marker = markers.get(id)
  let cx: number
  let cy: number
  let span = 0
  if (shape) {
    const [x0, y0, x1, y1] = shape.b as [number, number, number, number]
    span = Math.max(x1 - x0, ((y1 - y0) * W) / H)
    if (span > W * 0.12) return null
    cx = (x0 + x1) / 2
    cy = (y0 + y1) / 2
  } else if (marker) {
    cx = marker.x
    cy = marker.y
  } else return null
  const w = Math.max(span * 4, W / 6)
  const h = (w * H) / W
  return clampBox({ x: cx - w / 2, y: cy - h / 2, w, h }, W, H)
}

export const WorldChoropleth: React.FC<WorldChoroplethProps> = ({
  geometry,
  view,
  theme,
  selectedId,
  onSelect,
}) => {
  const W = geometry.width
  const H = geometry.height
  const world = useMemo<Box>(() => ({ x: 0, y: 0, w: W, h: H }), [W, H])
  const [box, setBox] = useState<Box>(world)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const dragged = useRef(false)
  const pinchDist = useRef<number | null>(null)

  const rawId = useId()
  const uid = rawId.replace(/[^a-zA-Z0-9_-]/g, '')
  const hatchId = `wm-hatch-${uid}`
  const descId = `wm-desc-${uid}`
  const t = CHOROPLETH_THEME[theme]

  const shapeById = useMemo(
    () => new Map(geometry.countries.map(c => [c.id, c])),
    [geometry]
  )
  const markerById = useMemo(
    () => new Map(geometry.markers.map(m => [m.id, m])),
    [geometry]
  )

  // Selecting a small country (or a dot) zooms to it; a large one keeps the
  // current view, since it is already legible at world scale. Adjusted
  // during render when the selection changes (no effect round trip).
  const [zoomedFor, setZoomedFor] = useState<string | null>(null)
  if (selectedId !== zoomedFor) {
    setZoomedFor(selectedId)
    const target = selectionBox(selectedId, shapeById, markerById, W, H)
    if (target) setBox(target)
  }

  const zoomBy = (factor: number) =>
    setBox(b =>
      clampBox(zoomAround(b, factor, b.x + b.w / 2, b.y + b.h / 2), W, H)
    )

  const toUnits = (px: number) => {
    const el = svgRef.current
    const cw = el?.clientWidth || W
    return (px * box.w) / cw
  }

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    dragged.current = false
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()] as [
        { x: number; y: number },
        { x: number; y: number },
      ]
      pinchDist.current = Math.hypot(a.x - b.x, a.y - b.y)
    }
  }

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const prev = pointers.current.get(e.pointerId)
    if (!prev) return
    const next = { x: e.clientX, y: e.clientY }
    pointers.current.set(e.pointerId, next)
    if (pointers.current.size === 2 && pinchDist.current) {
      const [a, b] = [...pointers.current.values()] as [
        { x: number; y: number },
        { x: number; y: number },
      ]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      const factor = dist / pinchDist.current
      pinchDist.current = dist
      dragged.current = true
      setBox(bx =>
        clampBox(zoomAround(bx, factor, bx.x + bx.w / 2, bx.y + bx.h / 2), W, H)
      )
      return
    }
    const dx = next.x - prev.x
    const dy = next.y - prev.y
    if (Math.abs(dx) + Math.abs(dy) > 3) dragged.current = true
    if (box.w >= W) return
    setBox(bx =>
      clampBox({ ...bx, x: bx.x - toUnits(dx), y: bx.y - toUnits(dy) }, W, H)
    )
  }

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinchDist.current = null
  }

  const select = (id: string) => {
    if (dragged.current) return
    onSelect(id === selectedId ? null : id)
  }

  const fillFor = (row: ChoroplethRow | undefined): string =>
    row && row.bin !== null ? t.fills[row.bin]! : `url(#${hatchId})`

  const zoomed = box.w < W - 0.5
  const unit = box.w / W
  const readoutId = hoveredId ?? selectedId
  const selectedShape = selectedId ? shapeById.get(selectedId) : undefined
  const markerRows = view.rows.filter(
    r => r.placement === 'marker' && r.isoId && markerById.has(r.isoId)
  )

  return (
    <figure className="wm-map" data-theme-variant={theme}>
      <div className="wm-map__frame" style={{ background: t.water }}>
        <svg
          ref={svgRef}
          className={zoomed ? 'wm-map__svg wm-map__svg--zoomed' : 'wm-map__svg'}
          role="img"
          aria-label="Map of clubs by country"
          aria-describedby={descId}
          viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
          preserveAspectRatio="xMidYMid meet"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={() => setHoveredId(null)}
        >
          <defs>
            <pattern
              id={hatchId}
              patternUnits="userSpaceOnUse"
              width={4 * unit}
              height={4 * unit}
              patternTransform="rotate(45)"
            >
              <rect width={4 * unit} height={4 * unit} fill={t.noClubs} />
              <line
                x1={0}
                y1={0}
                x2={0}
                y2={4 * unit}
                stroke={t.hatch}
                strokeWidth={1.4 * unit}
              />
            </pattern>
          </defs>
          <path d={geometry.sphere} fill={t.water} />
          <g stroke={t.border} strokeWidth={0.5} strokeLinejoin="round">
            {geometry.countries.map(c => {
              const row = view.byIsoId.get(c.id)
              return (
                <path
                  key={c.id}
                  d={c.d}
                  data-iso={c.id}
                  data-bin={row && row.bin !== null ? String(row.bin) : 'none'}
                  fill={fillFor(row)}
                  vectorEffect="non-scaling-stroke"
                  className={
                    c.id === selectedId
                      ? 'wm-country wm-country--selected'
                      : 'wm-country'
                  }
                  onPointerEnter={() => setHoveredId(c.id)}
                  onClick={() => select(c.id)}
                />
              )
            })}
          </g>
          {selectedShape && (
            <g pointerEvents="none" fill="none">
              <path
                d={selectedShape.d}
                stroke={t.selection.outer}
                strokeWidth={4}
                vectorEffect="non-scaling-stroke"
              />
              <path
                d={selectedShape.d}
                stroke={t.selection.inner}
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
              />
            </g>
          )}
          <g>
            {markerRows.map(row => {
              const m = markerById.get(row.isoId!)!
              const isSel = row.isoId === selectedId
              const r = (isSel ? 7 : 4) * unit
              return (
                <g
                  key={m.id}
                  onPointerEnter={() => setHoveredId(m.id)}
                  onClick={() => select(m.id)}
                  className="wm-marker"
                >
                  <circle cx={m.x} cy={m.y} r={11 * unit} fill="transparent" />
                  {isSel && (
                    <circle
                      cx={m.x}
                      cy={m.y}
                      r={r + 2 * unit}
                      fill={t.selection.outer}
                    />
                  )}
                  <circle
                    data-iso={m.id}
                    cx={m.x}
                    cy={m.y}
                    r={r}
                    fill={fillFor(row)}
                    stroke={isSel ? t.selection.inner : t.markerOutline}
                    strokeWidth={isSel ? 2 : 1}
                    vectorEffect="non-scaling-stroke"
                  />
                </g>
              )
            })}
          </g>
        </svg>

        <div className="wm-map__zoom" role="group" aria-label="Map zoom">
          <button
            type="button"
            className="wm-map__zoom-btn"
            onClick={() => zoomBy(ZOOM_STEP)}
            disabled={box.w <= W / MAX_ZOOM + 0.5}
            aria-label="Zoom in"
          >
            <span aria-hidden="true">+</span>
          </button>
          <button
            type="button"
            className="wm-map__zoom-btn"
            onClick={() => zoomBy(1 / ZOOM_STEP)}
            disabled={!zoomed}
            aria-label="Zoom out"
          >
            <span aria-hidden="true">−</span>
          </button>
          <button
            type="button"
            className="wm-map__zoom-btn wm-map__zoom-btn--text"
            onClick={() => setBox(world)}
            disabled={!zoomed}
            aria-label="Show whole world"
          >
            World
          </button>
        </div>
      </div>

      <p id={descId} className="sr-only">
        Each country is shaded by its number of clubs. The same values are in
        the ranked table on this page.
      </p>

      <Readout
        id={readoutId}
        row={readoutId ? view.byIsoId.get(readoutId) : undefined}
        fallbackName={
          readoutId
            ? (shapeById.get(readoutId)?.name ??
              markerById.get(readoutId)?.name ??
              null)
            : null
        }
        countries={view.rows.length}
      />

      <Legend theme={theme} />
    </figure>
  )
}

const Readout: React.FC<{
  id: string | null
  row: ChoroplethRow | undefined
  fallbackName: string | null
  countries: number
}> = ({ id, row, fallbackName, countries }) => (
  <div className="wm-readout" data-testid="wm-readout" aria-live="polite">
    {!id && (
      <span className="wm-readout__hint">
        Tap or hover a country to see its clubs.
      </span>
    )}
    {id && row && (
      <>
        <strong className="wm-readout__name">{row.name}</strong>
        <span className="wm-readout__value">
          {NUM.format(row.clubs)} {row.clubs === 1 ? 'club' : 'clubs'} ·{' '}
          {row.sharePct.toFixed(1)}% of clubs · #{row.rank} of {countries}{' '}
          countries
        </span>
      </>
    )}
    {id && !row && fallbackName && (
      <>
        <strong className="wm-readout__name">{fallbackName}</strong>
        <span className="wm-readout__value">No clubs located</span>
      </>
    )}
  </div>
)

const Legend: React.FC<{ theme: Theme }> = ({ theme }) => {
  const t = CHOROPLETH_THEME[theme]
  return (
    <div className="wm-legend">
      <p className="wm-legend__title" aria-hidden="true">
        Clubs per country
      </p>
      <ul className="wm-legend__list" aria-label="Legend: clubs per country">
        {CHOROPLETH_BINS.map((bin, i) => (
          <li key={bin.label} className="wm-legend__item">
            <span
              className="wm-legend__swatch"
              style={{ background: t.fills[i] }}
              aria-hidden="true"
            />
            {bin.label}
          </li>
        ))}
        <li className="wm-legend__item">
          <span
            className="wm-legend__swatch wm-legend__swatch--none"
            style={{
              backgroundColor: t.noClubs,
              backgroundImage: `repeating-linear-gradient(45deg, ${t.hatch} 0 1.5px, transparent 1.5px 5px)`,
            }}
            aria-hidden="true"
          />
          No clubs located
        </li>
      </ul>
      <p className="wm-legend__note">
        Dots mark territories too small to draw at world scale.
      </p>
    </div>
  )
}

export default WorldChoropleth
