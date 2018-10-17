// @ts-ignore
import * as metadata from "../package.json"
import * as cosmiconfig from "cosmiconfig"
import { run, TopLevelOptions } from "."

export const showVersionInfo = () =>
  console.log(`InGenR (${metadata.version})\n---\n${metadata.description}`)

export const showHelp = () => {
  showVersionInfo()
  console.log("Usage:")
  console.log(`ingenr help: Show help`)
  console.log(`ingenr version: Show version`)
  console.log(`ingenr run: Run ingenr in this project`)
  console.log(`ingenr run src/index.ts: Run ingenr for a specific file`)
  console.log(`ingenr run src/*.ts: Run ingenr for files matching glob pattern`)
}

export const runWithDiscoveredConfig = async (parsedArgs: string[]) => {
  const configLocator = cosmiconfig("ingenr")
  try {
    const searchResult = await configLocator.search()
    let config: Partial<TopLevelOptions> = searchResult ? searchResult.config : {}
    if (parsedArgs[1]) {
      config.inputPattern = parsedArgs[1]
    }
    await run(config)
  } catch (e) {
    console.error(e)
    console.error("InGenR could not parse specified config")
  }
}
