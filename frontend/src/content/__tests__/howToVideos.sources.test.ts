import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { HOW_TO_VIDEOS } from '../howToVideos'
import {
  SECTION_VIDEO_SEGMENTS,
  sectionVideoId,
} from '../../config/sectionVideos'

/* Guards that read source files: the steps against the scenario files they
   are copied from, and each header link against the page that must show it. */

const here = dirname(fileURLToPath(import.meta.url))
const src = (rel: string): string => readFileSync(resolve(here, rel), 'utf-8')

const STRING = /(['"])((?:\\.|(?!\1).)*)\1/s

/** Beat captions of a scenario file, in order (title and closing cards out). */
function beatCaptions(id: string): string[] {
  const text = src(`../../../../videos/src/scenarios/${id}.ts`)
  const captions = [
    ...text.matchAll(/caption:\s*((['"])(?:\\.|(?!\2).)*\2)/gs),
  ].map(m => (STRING.exec(m[1] ?? '')?.[2] ?? '').replace(/\\(['"])/g, '$1'))
  return captions.slice(1, -1)
}

describe('howToVideos steps match the scenario files', () => {
  it.each(HOW_TO_VIDEOS.map(v => [v.id, v] as const))(
    '%s: steps equal the scenario beat captions, in order',
    (id, v) => {
      expect([...v.steps]).toEqual(beatCaptions(id))
    }
  )
})

describe('sectionVideos', () => {
  it('does not import the video catalogue', () => {
    expect(src('../../config/sectionVideos.ts')).not.toMatch(
      /from\s+['"][^'"]*howToVideos['"]/
    )
  })

  it.each(SECTION_VIDEO_SEGMENTS.map(s => [s || '(hub)', s] as const))(
    'the %s page renders a component that shows the Watch how link',
    (_name, segment) => {
      const app = src('../../App.tsx')
      const path = segment
        ? `district/:districtId/${segment}`
        : 'district/:districtId'
      const at = app.indexOf(`path: '${path}'`)
      expect(at, `no route for ${path}`).toBeGreaterThan(-1)
      const element = /<(District\w+Page)\b/.exec(app.slice(at, at + 400))
      expect(element, `no page element for ${path}`).not.toBeNull()
      const page = src(`../../pages/${element?.[1]}.tsx`)
      expect(sectionVideoId(segment)).toBeDefined()
      expect(page).toMatch(/<(DistrictDetailHeader|DistrictSectionIntro)\b/)
    }
  )
})
