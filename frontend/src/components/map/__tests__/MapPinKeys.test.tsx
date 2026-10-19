/**
 * Keyboard path between map pins (#1940). The pins are drawn on a WebGL
 * canvas, so a lazy overlay mirrors the rendered pins as real buttons: one
 * Tab stop, arrows move between pins in reading order, Enter opens the club
 * (or zooms a cluster), Escape closes the club and keeps focus on its pin.
 * Each pin is named by club and category, never by colour.
 */
import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import type { Map as MapLibreMap } from 'maplibre-gl'
import type { ClubTrend } from '../../../hooks/useDistrictAnalytics'
import { buildModeModel } from '../pinModes'
import { MapPinKeys } from '../MapPinKeys'
import { PIN_HEAD_LIFT } from '../pinGlyphs'
import { pinTargets, type RenderedPin } from '../pinTargets'

const model = buildModeModel('health')
const layers = { source: 's', cluster: 'c', pin: 'p' }
const cat = (key: string) => model.categories.findIndex(c => c.key === key)

const club = (clubId: string, clubName: string): ClubTrend =>
  ({ clubId, clubName }) as ClubTrend

const clubs = [
  club('1', 'Alpha Speakers'),
  club('2', 'Bravo Talkers'),
  club('3', 'Charlie Club'),
  club('4', 'Delta Orators'),
]

const pin = (id: string, at: [number, number], k: number): RenderedPin => ({
  geometry: { type: 'Point', coordinates: at },
  properties: { id, k },
})

const cluster = (
  clusterId: number,
  at: [number, number],
  count: number
): RenderedPin => ({
  geometry: { type: 'Point', coordinates: at },
  properties: { cluster: true, cluster_id: clusterId, point_count: count },
})

// Screen position: x = lng * 10, y = -lat * 10 (north is up).
const project = ([lng, lat]: [number, number]) => ({
  x: lng * 10,
  y: -lat * 10,
})

function fakeMap(features: RenderedPin[]) {
  const handlers = new Map<string, Set<() => void>>()
  const map = {
    features,
    on: vi.fn((ev: string, fn: () => void) => {
      if (!handlers.has(ev)) handlers.set(ev, new Set())
      handlers.get(ev)!.add(fn)
    }),
    off: vi.fn((ev: string, fn: () => void) => handlers.get(ev)?.delete(fn)),
    fire: (ev: string) => handlers.get(ev)?.forEach(fn => fn()),
    getLayer: () => ({}),
    queryRenderedFeatures: vi.fn(() => map.features),
    project: (c: [number, number]) => project(c),
    getSource: () => ({
      getClusterExpansionZoom: () => Promise.resolve(9),
    }),
    easeTo: vi.fn(),
    jumpTo: vi.fn(),
  }
  return map
}

const setup = (
  features: RenderedPin[],
  selectedIds: string[] = [],
  onSelect = vi.fn(),
  onOpen = vi.fn()
) => {
  const map = fakeMap(features)
  const utils = render(
    <MapPinKeys
      map={map as unknown as MapLibreMap}
      clubs={clubs}
      model={model}
      selectedIds={selectedIds}
      onSelect={onSelect}
      onOpen={onOpen}
      layers={layers}
    />
  )
  return { map, onSelect, onOpen, ...utils }
}

describe('pinTargets', () => {
  it('orders pins north to south, then west to east, named by club and category', () => {
    const targets = pinTargets(
      [
        pin('2', [5, 10], cat('vulnerable')),
        pin('1', [1, 10], cat('thriving')),
        pin('3', [0, 0], cat('intervention-required')),
      ],
      project,
      clubs,
      model
    )
    expect(targets.map(t => t.label)).toEqual([
      'Alpha Speakers, Thriving',
      'Bravo Talkers, Vulnerable',
      'Charlie Club, Intervention required',
    ])
  })

  it('merges co-located clubs into one target and drops tile duplicates', () => {
    const targets = pinTargets(
      [
        pin('1', [1, 1], cat('thriving')),
        pin('2', [1, 1], cat('vulnerable')),
        pin('1', [1, 1], cat('thriving')),
        cluster(7, [3, 3], 5),
        cluster(7, [3, 3], 5),
      ],
      project,
      clubs,
      model
    )
    expect(targets).toHaveLength(2)
    expect(targets.find(t => t.cluster)!.label).toBe(
      'Group of 5 clubs. Enter zooms in'
    )
    const here = targets.find(t => !t.cluster)!
    expect(here.ids).toEqual(['1', '2'])
    expect(here.label).toBe(
      '2 clubs here: Alpha Speakers, Thriving; Bravo Talkers, Vulnerable'
    )
  })
})

describe('MapPinKeys', () => {
  const three = [
    pin('1', [1, 10], cat('thriving')),
    pin('2', [5, 10], cat('vulnerable')),
    pin('3', [0, 0], cat('intervention-required')),
  ]

  it('is one Tab stop, and the arrows move between pins', () => {
    setup(three)
    const group = screen.getByRole('toolbar', { name: /club pins/i })
    const buttons = screen.getAllByRole('button')
    expect(buttons.map(b => b.tabIndex)).toEqual([0, -1, -1])
    expect(group).toContainElement(buttons[0]!)

    act(() => buttons[0]!.focus())
    fireEvent.keyDown(buttons[0]!, { key: 'ArrowRight' })
    expect(
      screen.getByRole('button', { name: 'Bravo Talkers, Vulnerable' })
    ).toHaveFocus()
    expect(buttons.map(b => b.tabIndex)).toEqual([-1, 0, -1])
    fireEvent.keyDown(document.activeElement!, { key: 'End' })
    expect(buttons[2]).toHaveFocus()
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
    expect(buttons[2]).toHaveFocus()
    fireEvent.keyDown(document.activeElement!, { key: 'Home' })
    expect(buttons[0]).toHaveFocus()
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' })
    expect(buttons[0]).toHaveFocus()
  })

  it('does not trap Tab', () => {
    setup(three)
    const first = screen.getAllByRole('button')[0]!
    act(() => first.focus())
    const tab = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    })
    first.dispatchEvent(tab)
    expect(tab.defaultPrevented).toBe(false)
  })

  it('Enter opens the club; Escape closes it and keeps focus on the pin', () => {
    const { onSelect, rerender, map } = setup(three)
    const bravo = screen.getByRole('button', {
      name: 'Bravo Talkers, Vulnerable',
    })
    act(() => bravo.focus())
    fireEvent.click(bravo)
    expect(onSelect).toHaveBeenLastCalledWith(['2'])

    rerender(
      <MapPinKeys
        map={map as unknown as MapLibreMap}
        clubs={clubs}
        model={model}
        selectedIds={['2']}
        onSelect={onSelect}
        layers={layers}
      />
    )
    fireEvent.keyDown(bravo, { key: 'Escape' })
    expect(onSelect).toHaveBeenLastCalledWith([])
    expect(bravo).toHaveFocus()
  })

  it('Enter on a club hands its pin to onOpen, so focus can come back (#1967)', () => {
    const { onOpen } = setup(three)
    const bravo = screen.getByRole('button', {
      name: 'Bravo Talkers, Vulnerable',
    })
    fireEvent.click(bravo)
    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(onOpen).toHaveBeenCalledWith(bravo)
  })

  it('Escape with nothing open does nothing', () => {
    const { onSelect } = setup(three)
    const first = screen.getAllByRole('button')[0]!
    fireEvent.keyDown(first, { key: 'Escape' })
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('Enter on a cluster zooms into it instead of selecting', async () => {
    const { onSelect, onOpen, map } = setup([cluster(7, [3, 3], 5)])
    fireEvent.click(
      screen.getByRole('button', { name: 'Group of 5 clubs. Enter zooms in' })
    )
    await act(async () => {})
    expect(onSelect).not.toHaveBeenCalled()
    expect(onOpen).not.toHaveBeenCalled()
    expect(map.easeTo.mock.calls.length + map.jumpTo.mock.calls.length).toBe(1)
  })

  it('follows the map: re-reads the rendered pins when it settles', () => {
    const { map } = setup(three)
    expect(screen.getAllByRole('button')).toHaveLength(3)
    map.features = [pin('4', [2, 2], cat('thriving'))]
    act(() => map.fire('idle'))
    expect(
      screen.getByRole('button', { name: 'Delta Orators, Thriving' })
    ).toBeInTheDocument()
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })

  it('places each pin button over its pin', () => {
    setup(three)
    const b = screen.getByRole('button', { name: 'Bravo Talkers, Vulnerable' })
    // A 44 px box centred on the pin's head: the tip is on (50, -100) and
    // the head sits PIN_HEAD_LIFT above it (#2173, bottom-anchored pins).
    const y = Math.round(-100 - PIN_HEAD_LIFT - 22)
    expect(b.style.transform).toBe(`translate(28px, ${y}px)`)
    expect(y).toBeLessThan(-122)
  })
})
