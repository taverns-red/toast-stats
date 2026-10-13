import React from 'react'
import type { PinCategory } from './pinModes'

/* The legend's picture of a pin (#1784): the same shape and fill the map
   draws, so a reader matches chip to pin by shape as well as colour (WCAG
   1.4.1, spec §3.2). Decorative — the chip's text carries the meaning. */

const LEVEL: Record<string, number> = {
  fill0: 0,
  fill25: 0.25,
  fill50: 0.5,
  fill75: 0.75,
  fill100: 1,
}

const UP = 'M7 1.5L12.6 11.5H1.4Z'
const DOWN = 'M7 12.5L12.6 2.5H1.4Z'
const ARROWS: Record<string, string> = {
  triangle: UP,
  up: UP,
  upHalf: UP,
  down: DOWN,
  downHalf: DOWN,
}

function wedge(level: number): string {
  if (level >= 1) return ''
  const a = -Math.PI / 2 + level * Math.PI * 2
  const x = 7 + 5.5 * Math.cos(a)
  const y = 7 + 5.5 * Math.sin(a)
  return `M7 7V1.5A5.5 5.5 0 ${level > 0.5 ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)}Z`
}

export const PinSwatch: React.FC<{ category: PinCategory }> = ({
  category: { shape, fill },
}) => {
  const level = LEVEL[shape]
  let body: React.ReactNode
  const arrow = ARROWS[shape]
  if (arrow) {
    // Direction (net growth): solid for the big step, open for the small.
    body = shape.endsWith('Half') ? (
      <>
        <path d={arrow} className="pin-swatch__bg" />
        <path
          d={arrow}
          fill="none"
          stroke={fill}
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </>
    ) : (
      <path d={arrow} fill={fill} />
    )
  } else if (shape === 'na') {
    body = (
      <circle
        cx="7"
        cy="7"
        r="3.75"
        fill="none"
        stroke={fill}
        strokeWidth="1.5"
      />
    )
  } else if (shape === 'square') {
    body = <rect x="2" y="2" width="10" height="10" fill={fill} />
  } else if (shape === 'suspended') {
    body = (
      <>
        <circle
          cx="7"
          cy="7"
          r="5.5"
          fill="none"
          stroke={fill}
          strokeWidth="2"
        />
        <path d="M3.5 10.5L10.5 3.5" stroke={fill} strokeWidth="2" />
      </>
    )
  } else if (level !== undefined) {
    body = (
      <>
        <circle cx="7" cy="7" r="5.5" className="pin-swatch__bg" />
        {level >= 1 ? (
          <circle cx="7" cy="7" r="5.5" fill={fill} />
        ) : level > 0 ? (
          <path d={wedge(level)} fill={fill} />
        ) : null}
        <circle
          cx="7"
          cy="7"
          r="4.75"
          fill="none"
          stroke={fill}
          strokeWidth="1.5"
        />
      </>
    )
  } else {
    body = <circle cx="7" cy="7" r="5.5" fill={fill} />
  }
  return (
    <svg
      className="pin-swatch"
      width="14"
      height="14"
      viewBox="0 0 14 14"
      aria-hidden="true"
      focusable="false"
    >
      {body}
    </svg>
  )
}
