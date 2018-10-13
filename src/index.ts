import * as fs from "fs"
import _debug from "debug"
import * as log from "fancy-log"
import { promisify } from "util"
import * as _glob from "glob"
import { defaultsDeep } from "lodash"
import { defaultParserOptions, CommentParser } from "./CommentParser"
import { defaultLocatorOptions, GeneratorLocator } from "./GeneratorLocator"
import { TemplateProcessor } from "./TemplateProcessor"
import { ConsoleReporter } from "./ConsoleReporter"

const glob = promisify(_glob)
const debug = _debug("InGenR:run")

export const defaultOptions = {
  inputPattern: "src/**/*.+(c|cpp|js|ts|jsx|java|cs)",
  parser: defaultParserOptions,
  locator: defaultLocatorOptions,
  reporter: {}
}

export type TopLevelOptions = typeof defaultOptions

export async function run(options = defaultOptions) {
  defaultsDeep(options, defaultOptions)
  debug("Running with options: %O", options)
  const locator = new GeneratorLocator(options.locator)
  const reporter = new ConsoleReporter(options.reporter)
  debug("Bootstrapping project")
  await locator.bootstrap()
  const files = await glob(options.inputPattern)
  log.info(`Processing ${files.length} file(s)`)
  return Promise.all(
    files.map(async (f: string) =>
      new TemplateProcessor(f, options, { reporter, locator }).process()
    )
  )
}
