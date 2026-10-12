import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PMTiles, TileType, type RangeResponse, type Source } from 'pmtiles'

/* #1786 — the committed fixture tileset is a real Protomaps v4 extract
 * (world, z0 only, 67 KB; `pmtiles extract … --maxzoom=0`), so the map
 * component and the 375 smoke run against the same archive format the CDN
 * will serve. Reading it here goes through `pmtiles`' own range-request
 * Source contract (offset + length), which is what the CDN must honour. */

// vitest runs with the frontend workspace as cwd.
const FIXTURE = resolve(process.cwd(), 'e2e/fixtures/basemap-z0.pmtiles')

class BufferSource implements Source {
  readonly requests: Array<[number, number]> = []
  constructor(private readonly bytes: Uint8Array) {}
  getKey(): string {
    return 'fixture'
  }
  async getBytes(offset: number, length: number): Promise<RangeResponse> {
    this.requests.push([offset, length])
    const slice = this.bytes.slice(offset, offset + length)
    return { data: slice.buffer }
  }
}

describe('basemap fixture tileset', () => {
  it('is a Protomaps v4 MVT archive with a z0 tile', async () => {
    const source = new BufferSource(new Uint8Array(readFileSync(FIXTURE)))
    const archive = new PMTiles(source)
    const header = await archive.getHeader()
    expect(header.specVersion).toBe(3)
    expect(header.tileType).toBe(TileType.Mvt)
    expect(header.minZoom).toBe(0)
    expect(header.maxZoom).toBe(0)

    const meta = (await archive.getMetadata()) as {
      attribution?: string
      name?: string
    }
    expect(meta.name).toBe('Protomaps Basemap')
    expect(meta.attribution).toContain('OpenStreetMap')

    const tile = await archive.getZxy(0, 0, 0)
    expect(tile?.data.byteLength).toBeGreaterThan(1000)
    // Reads are ranged — never the whole archive in one request.
    const size = readFileSync(FIXTURE).byteLength
    expect(source.requests.every(([, len]) => len < size)).toBe(true)
  })
})
