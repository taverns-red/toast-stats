#!/usr/bin/env tsx
/**
 * Entry point for ./bin/agent-cli (#2418). All logic lives in
 * scripts/lib/agentCli/ (unit-tested); run `./bin/agent-cli --help`.
 */
import { main } from './lib/agentCli/cli.js'

main(process.argv.slice(2)).then(
  code => {
    process.exitCode = code
  },
  err => {
    console.error(err)
    process.exitCode = 3
  }
)
