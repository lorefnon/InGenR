#!/usr/bin/env node

import * as minimist from "minimist"

import { showHelp, showVersionInfo, runWithDiscoveredConfig } from "./commands"

const argv = minimist(process.argv.slice(2), {
  boolean: true,
  string: "input",
  alias: {
    r: "run",
    h: "help",
    v: "version"
  }
})
;(async () => {
  const subCommand = argv._[0]
  if (argv.help || subCommand === "help") {
    showHelp()
    return
  }
  if (argv.version || subCommand === "version") {
    showVersionInfo()
    return
  }
  if (subCommand === "run") {
    await runWithDiscoveredConfig(argv._)
    return
  }
  console.log("This does not look like a correct usage.")
  showHelp()
})().catch(e => {
  console.error(e)
  console.error("InGenR encountered a fatal error and must now quit.")
  process.exit(1)
})
