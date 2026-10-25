---
date: 2026-10-25
tier: lesson
summary: '`npm run x -- <arg>` appends the arg to the whole script string, so in `a && b` only `b` receives it; a script that takes arguments must be a single entry point'
tags: [npm, monorepo, scripts, cli, automation]
---

# npm run arguments reach only the last command in a chained script

**Date:** 2026-10-25
**Issue:** #2293 (videos workspace, Remotion pilot)

## What happened

The videos workspace defined
`"build": "tsx src/cli/capture.ts && tsx src/cli/render.ts"`, and the root
forwarded `npm run videos:build -- v2`. The capture step failed with its usage
error. npm appends everything after `--` to the end of the script string, so
the shell ran `tsx src/cli/capture.ts && tsx src/cli/render.ts v2`. Only the
last command got the scenario id.

The individual `videos:capture -- v2` and `videos:render -- v2` scripts both
worked, so the bug showed up only in the combined command. A `--`-forwarding
root alias (`npm run build --workspace=x --`) does not change this; it forwards
to the same string.

## The takeaway

**If an npm script takes arguments, it must be one command.** To combine steps
that each need the argument, write a small entry file that imports the steps
and runs them in order (here `src/cli/build.ts` calls `capture(id)` and then
`render(id)`). Each step module runs itself only when it is the process entry
point. Don't chain them with `&&` in `package.json`, and don't reach for
`$npm_config_*` or positional-argument tricks in the shell, which behave
differently across npm versions and platforms.
