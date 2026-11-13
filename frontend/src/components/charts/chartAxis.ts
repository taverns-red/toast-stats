/* Shared Recharts axis text (#2659).

   Recharts paints tick text with the axis `stroke` unless `tick` names a
   fill. `--tm-cool-gray` as a stroke made every tick 2.17:1 on white, so the
   axis line keeps the cool-gray stroke and the text takes an ink token
   (`--ink-2`, which the dark theme remaps; 4.5:1 or better in both). */

/** Tick text: pass as `tick={AXIS_TICK}`. */
export const AXIS_TICK = { fill: 'var(--ink-2)', fontSize: 12 } as const

/** Tick text at the 14px data floor (#1840, #2125). */
export const AXIS_TICK_LARGE = { fill: 'var(--ink-2)', fontSize: 14 } as const

/** Axis title: pass inside `label={{ ..., style: AXIS_LABEL_STYLE }}`. */
export const AXIS_LABEL_STYLE = { fill: 'var(--ink-2)', fontSize: 12 } as const
