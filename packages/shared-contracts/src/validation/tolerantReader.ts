/**
 * Tolerant readers from strict contracts (#2493, ADR 0019 step 0 in
 * `taverns-red/ops`).
 *
 * Zod's `.strict()` is per object, not deep. `toTolerantReader` rebuilds a
 * schema with every strict object, at any depth, turned into a stripping
 * one: an unknown key is dropped instead of failing the parse. Everything
 * else is kept as it is: field types, refinements (`superRefine` checks live
 * on the def and are copied), optional/nullable wrappers, unions.
 *
 * `findStrictObjects` reports where a schema still rejects unknown keys. The
 * reader guard tests use it on every schema a reader parses with.
 *
 * Supported node types are the ones the contracts use. A lazy schema is not
 * walked: `toTolerantReader` throws on one rather than leave a strict object
 * behind it unseen.
 *
 * @module tolerantReader
 */

import type { ZodType } from 'zod'

interface Def {
  type: string
  shape?: unknown
  catchall?: unknown
  options?: unknown
  items?: unknown
  rest?: unknown
  element?: unknown
  valueType?: unknown
  [key: string]: unknown
}

const defOf = (schema: ZodType): Def =>
  (schema as unknown as { _zod: { def: Def } })._zod.def

const isSchema = (v: unknown): v is ZodType =>
  typeof v === 'object' && v !== null && '_zod' in v

/** `.strict()` / `z.strictObject` set the object's catchall to `never`. */
const isStrictObject = (def: Def): boolean =>
  def.type === 'object' &&
  isSchema(def.catchall) &&
  defOf(def.catchall).type === 'never'

/** Def keys holding a single child schema, by node type. */
const CHILD_KEYS: Record<string, readonly string[]> = {
  array: ['element'],
  record: ['keyType', 'valueType'],
  optional: ['innerType'],
  nullable: ['innerType'],
  default: ['innerType'],
  prefault: ['innerType'],
  nonoptional: ['innerType'],
  readonly: ['innerType'],
  catch: ['innerType'],
  promise: ['innerType'],
  pipe: ['in', 'out'],
  intersection: ['left', 'right'],
  map: ['keyType', 'valueType'],
  set: ['valueType'],
}

function loosen(schema: ZodType, memo: Map<ZodType, ZodType>): ZodType {
  const hit = memo.get(schema)
  if (hit) return hit
  const def = defOf(schema)
  const next: Def = { ...def }
  let changed = false
  const swap = (child: unknown): unknown => {
    if (!isSchema(child)) return child
    const out = loosen(child, memo)
    if (out !== child) changed = true
    return out
  }

  switch (def.type) {
    case 'lazy':
      throw new Error('toTolerantReader: lazy schemas are not supported')
    case 'object': {
      const shape = def.shape as Record<string, ZodType>
      next.shape = Object.fromEntries(
        Object.entries(shape).map(([k, v]) => [k, swap(v)])
      )
      if (isStrictObject(def)) {
        next.catchall = undefined
        changed = true
      } else {
        next.catchall = swap(def.catchall)
      }
      break
    }
    case 'union':
      next.options = (def.options as ZodType[]).map(swap)
      break
    case 'tuple':
      next.items = (def.items as ZodType[]).map(swap)
      next.rest = swap(def.rest)
      break
    default:
      for (const key of CHILD_KEYS[def.type] ?? []) next[key] = swap(def[key])
  }

  const out = changed
    ? (schema as unknown as { clone: (d: Def) => ZodType }).clone(next)
    : schema
  memo.set(schema, out)
  return out
}

/**
 * The same contract, but every object (at any depth) strips unknown keys
 * instead of rejecting them. The input schema is not modified.
 */
export function toTolerantReader<T extends ZodType>(schema: T): T {
  return loosen(schema, new Map()) as T
}

/**
 * Paths (`<root>`, `.a.b`, `[]`, `{}`, `|0` for union option 0) of every
 * object in `schema` that rejects unknown keys. Empty for a tolerant reader.
 */
export function findStrictObjects(schema: ZodType): string[] {
  const found: string[] = []
  const seen = new Set<ZodType>()
  const walk = (s: unknown, path: string): void => {
    if (!isSchema(s) || seen.has(s)) return
    seen.add(s)
    const def = defOf(s)
    switch (def.type) {
      case 'lazy':
        found.push(`${path || '<root>'} (lazy: not walked)`)
        return
      case 'object':
        if (isStrictObject(def)) found.push(path || '<root>')
        for (const [k, v] of Object.entries(
          def.shape as Record<string, ZodType>
        )) {
          walk(v, `${path}.${k}`)
        }
        walk(def.catchall, `${path}{*}`)
        return
      case 'array':
        walk(def.element, `${path}[]`)
        return
      case 'record':
        walk(def.valueType, `${path}{}`)
        return
      case 'union':
        ;(def.options as ZodType[]).forEach((o, i) => walk(o, `${path}|${i}`))
        return
      case 'tuple':
        ;(def.items as ZodType[]).forEach((o, i) => walk(o, `${path}[${i}]`))
        walk(def.rest, `${path}[...]`)
        return
      default:
        for (const key of CHILD_KEYS[def.type] ?? []) walk(def[key], path)
    }
  }
  walk(schema, '')
  return found
}
