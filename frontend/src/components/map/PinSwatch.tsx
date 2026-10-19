import React from 'react'
import { labelColourOn, type PinCategory } from './pinModes'
import { PIN_GLYPHS, glyphTransform, pinBodyPath, pinBox } from './pinGlyphs'

/* The legend's picture of a pin (#1784, #2173): the same teardrop, fill and
   glyph the map draws (`pinGlyphs`), so a reader matches chip to pin by the
   glyph as well as the colour (WCAG 1.4.1, spec §3.2). Decorative — the
   chip's text carries the meaning. */

const BOX = pinBox({ selected: false, code: '' })

export const PinSwatch: React.FC<{ category: PinCategory }> = ({
  category: { shape, fill },
}) => {
  const glyph = PIN_GLYPHS[shape]
  const hollow = glyph.body === 'outline' || glyph.body === 'dashed'
  const ink = hollow ? fill : labelColourOn(fill)
  const t = glyphTransform(BOX, glyph.body)
  return (
    <svg
      className="pin-swatch"
      width="14"
      height={Math.round((14 * BOX.h) / BOX.w)}
      viewBox={`0 0 ${BOX.w} ${BOX.h}`}
      aria-hidden="true"
      focusable="false"
      data-glyph={glyph.symbol}
    >
      <path
        d={pinBodyPath(BOX, glyph.body)}
        className={hollow ? 'pin-swatch__bg' : 'pin-swatch__edge'}
        fill={hollow ? undefined : fill}
        stroke={hollow ? fill : undefined}
        strokeWidth={hollow ? 2 : undefined}
        strokeDasharray={glyph.body === 'dashed' ? '3 2' : undefined}
        strokeLinejoin="round"
      />
      <g
        transform={`translate(${t.x} ${t.y}) scale(${t.k})`}
        fill={ink}
        stroke={ink}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {glyph.marks.map((m, i) =>
          m.paint === 'fill' ? (
            <path key={i} d={m.d} stroke="none" />
          ) : (
            <path key={i} d={m.d} fill="none" strokeWidth={m.width ?? 1.8} />
          )
        )}
      </g>
    </svg>
  )
}
