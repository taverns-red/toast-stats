/**
 * The colour-mode picker previews every mode it offers (#2214): the world
 * explorer's Region mode (#1809) once fell through to `extendedModel`, which
 * has no bins for it, and opening the picker crashed /regions/map.
 */
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { ModePicker, type ModeList } from '../MapModePicker'
import { CATEGORICAL8, MAP_COLOR_MODES } from '../pinModes'
import { REGION_COLOR_MODES, WORLD_COLOR_MODES } from '../regionModes'

const swatchFills = (label: string) =>
  [
    ...screen
      .getByRole('button', { name: label })
      .querySelectorAll('.pin-swatch > path'),
  ].map(p => p.getAttribute('fill'))

describe.each<[string, ModeList]>([
  ['world', WORLD_COLOR_MODES],
  ['region', REGION_COLOR_MODES],
  ['district', MAP_COLOR_MODES],
])('ModePicker with the %s map modes', (_name, modes) => {
  it('renders every mode with a pin preview of up to five swatches', () => {
    render(<ModePicker mode="health" onChange={() => {}} modes={modes} />)
    for (const m of modes) {
      const btn = screen.getByRole('button', { name: m.label })
      const n = btn.querySelectorAll('.pin-swatch').length
      expect(n).toBeGreaterThan(0)
      expect(n).toBeLessThanOrEqual(5)
    }
  })
})

describe('ModePicker territory previews', () => {
  it('previews Region and District as categorical hues, as the world map draws them', () => {
    render(
      <ModePicker mode="health" onChange={() => {}} modes={WORLD_COLOR_MODES} />
    )
    const categorical = CATEGORICAL8.slice(0, 5)
    expect(swatchFills('Region')).toEqual(categorical)
    expect(swatchFills('District')).toEqual(categorical)
  })
})
