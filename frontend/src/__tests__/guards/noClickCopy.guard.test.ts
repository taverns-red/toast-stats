import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const frontend = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const CLICK_INSTRUCTION = /\bClick (?:a|an|any|the|on)\b/
const COMMENT_LINE = /^\s*(?:\/\/|\/\*|\*|\{\/\*)/

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap(name => {
    if (name === '__tests__') return []
    const path = join(directory, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    if (!/\.tsx?$/.test(name) || /\.(?:test|stories)\./.test(name)) return []
    return [path]
  })
}

function clickHits(path: string): string[] {
  return readFileSync(path, 'utf8')
    .split('\n')
    .flatMap((line, index) =>
      !COMMENT_LINE.test(line) && CLICK_INSTRUCTION.test(line)
        ? [`${relative(frontend, path)}:${index + 1}`]
        : []
    )
}

describe('reader-facing copy says Select, not Click', () => {
  it('has no "Click a/an/any/the/on" outside comments', () => {
    const hits = ['src/pages', 'src/components']
      .flatMap(dir => sourceFiles(join(frontend, dir)))
      .flatMap(clickHits)

    expect(hits).toEqual([])
  })
})
