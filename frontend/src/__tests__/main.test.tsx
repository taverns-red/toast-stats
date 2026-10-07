/**
 * main.tsx — the Vite bootstrap (#1687).
 *
 * Not a page mount (R22): App is replaced by a stub and react-dom's root is
 * faked, so this pins only the boot sequence — font-loading setup runs first,
 * then the app renders into #root inside React.StrictMode, exactly once.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'

const calls: string[] = []
const render = vi.fn((_node: React.ReactNode) => {
  calls.push('render')
})
const createRoot = vi.fn((_el: Element) => {
  calls.push('createRoot')
  return { render }
})
const setupFontLoadingOptimization = vi.fn(() => {
  calls.push('setupFonts')
})

vi.mock('react-dom/client', () => ({
  default: { createRoot },
  createRoot,
}))
vi.mock('../App.tsx', () => ({ default: () => null }))
vi.mock('../utils/textEffectsRemover', () => ({
  setupFontLoadingOptimization,
}))

describe('main.tsx boot', () => {
  let root: HTMLElement

  beforeEach(() => {
    vi.resetModules()
    calls.length = 0
    render.mockClear()
    createRoot.mockClear()
    setupFontLoadingOptimization.mockClear()
    root = document.createElement('div')
    root.id = 'root'
    document.body.appendChild(root)
  })

  afterEach(() => {
    root.remove()
  })

  it('sets up font loading before creating the React root', async () => {
    await import('../main')

    expect(calls).toEqual(['setupFonts', 'createRoot', 'render'])
    expect(setupFontLoadingOptimization).toHaveBeenCalledTimes(1)
  })

  it('mounts into the #root element, once', async () => {
    await import('../main')

    expect(createRoot).toHaveBeenCalledTimes(1)
    expect(createRoot).toHaveBeenCalledWith(root)
    expect(render).toHaveBeenCalledTimes(1)
  })

  it('renders <App/> wrapped in React.StrictMode', async () => {
    const { default: App } = await import('../App.tsx')
    await import('../main')

    const tree = render.mock.calls[0]![0] as React.ReactElement<{
      children: React.ReactElement
    }>
    expect(tree.type).toBe(React.StrictMode)
    expect(tree.props.children.type).toBe(App)
  })
})
