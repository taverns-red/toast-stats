/**
 * #3000: `agent-cli live-version` read the release version from the Vite env
 * object, which sat in whichever chunk happened to read `import.meta.env`
 * (the entry, then the cdnBase chunk after #2999, #3013). With the CDN as a
 * build-time constant no critical-path chunk holds it, so the build writes the
 * version into index.html, where it can't move.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { appVersionMetaPlugin } from '../appVersionMeta.js'

describe('appVersionMetaPlugin (#3000)', () => {
  it('adds an app-version meta tag to the head when a version is set', () => {
    expect(appVersionMetaPlugin('v2.94.0').transformIndexHtml()).toEqual([
      {
        tag: 'meta',
        attrs: { name: 'app-version', content: 'v2.94.0' },
        injectTo: 'head',
      },
    ])
  })

  it('adds nothing for a preview or local build, which sets no version', () => {
    expect(appVersionMetaPlugin(undefined).transformIndexHtml()).toEqual([])
    expect(appVersionMetaPlugin('').transformIndexHtml()).toEqual([])
    expect(appVersionMetaPlugin('  ').transformIndexHtml()).toEqual([])
  })

  it('is registered in frontend/vite.config.ts', () => {
    const config = fs.readFileSync(
      path.join(process.cwd(), 'frontend/vite.config.ts'),
      'utf8'
    )
    expect(config).toMatch(/appVersionMetaPlugin\(/)
  })
})
