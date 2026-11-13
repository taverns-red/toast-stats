/* Recharts axis text contrast (#2659, HUB-09).
   An axis `stroke` colours the axis line, but Recharts also paints the tick
   text with it, so `stroke="var(--tm-cool-gray)"` made every tick label
   2.17:1 on white. A tick must name its own fill token (an ink token, which
   the dark theme remaps) or be hidden. Static: it reads the sources, so a
   new chart cannot skip it. */

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const COMPONENTS = join(__dirname, '..', '..')

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      return name === '__tests__' ? [] : sources(path)
    }
    return /\.tsx$/.test(name) ? [path] : []
  })
}

/** Every `<XAxis .../>` / `<YAxis .../>` element in a source, as text. */
function axisElements(source: string): string[] {
  return source.match(/<(?:XAxis|YAxis)\b[\s\S]*?\/>/g) ?? []
}

describe('Recharts axes name a tick fill token (#2659)', () => {
  const found = sources(COMPONENTS).flatMap(file =>
    axisElements(readFileSync(file, 'utf8')).map(el => ({ file, el }))
  )

  it('finds the axes (guards against the scan going blind)', () => {
    expect(found.length).toBeGreaterThanOrEqual(15)
  })

  it('every axis has a tick with an ink fill, or hides its ticks', () => {
    const offenders = found
      .filter(
        ({ el }) =>
          !/tick=\{false\}/.test(el) &&
          !/tick=\{AXIS_TICK(?:_LARGE)?\}/.test(el) &&
          !/tick=\{\{[^}]*fill:\s*'var\(--ink-[23]\)'/.test(el)
      )
      .map(({ file }) => file.replace(COMPONENTS, 'components'))
    expect([...new Set(offenders)]).toEqual([])
  })
})
