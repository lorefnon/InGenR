import * as fs from "fs"
import _debug from "debug"
import * as log from "fancy-log"
import { promisify } from "util"
import * as _glob from "glob"
import { defaultsDeep } from "lodash"
import { defaultParserOptions, CommentParser } from "./CommentParser"
import { defaultLocatorOptions, GeneratorLocator } from "./GeneratorLocator"
import { TemplateProcessor } from "./TemplateProcessor"
import { ConsoleReporter, Reporter } from "./ConsoleReporter"

const glob = promisify(_glob)
const debug = _debug("InGenR:run")

export const defaultOptions = {
  inputPattern: "src/**/*.+(c|cpp|js|ts|jsx|java|cs)",
  parser: defaultParserOptions,
  locator: defaultLocatorOptions,
  reporter: {}
}

export type TopLevelOptions = typeof defaultOptions

export async function run(options: Partial<TopLevelOptions> = defaultOptions) {
  const finalOptions: TopLevelOptions = defaultsDeep(options, defaultOptions)
  const files = await glob(finalOptions.inputPattern)
  debug("Running with options: %O on %d files: %O", finalOptions, files.length, files)
  await processProject(files, finalOptions)
}

export async function processProject(
  files: string[],
  passedOptions?: TopLevelOptions,
  passedLocator?: GeneratorLocator,
  passedReporter?: Reporter
) {
  const options = passedOptions || defaultOptions
  const reporter = passedReporter || new ConsoleReporter(options.reporter)
  const locator = passedLocator || new GeneratorLocator({ ...options.locator, reporter })
  debug("Bootstrapping project")
  await locator.bootstrap()
  log.info(`Processing ${files.length} file(s)`)
  await Promise.all(
    files.map(async (f: string) =>
      new TemplateProcessor(f, options, { reporter, locator }).process()
    )
  )
  reporter.reportAllWarnings()
}
