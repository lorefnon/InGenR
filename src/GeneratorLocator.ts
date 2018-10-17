import * as path from "path"
import * as _fs from "fs"
import * as doT from "dot"
import _debug from "debug"
import { Directive } from "./CommentParser"
import { Reporter } from "./ConsoleReporter"
import { WarningEntry } from "./warnings"

const debug = _debug("InGenR:GeneratorLocator")
const fs = _fs.promises

// @ts-ignore
doT.templateSettings = {
  ...doT.templateSettings,
  strip: false
}

export interface LocatorOptions {
  generatorsDir: string | boolean
  reporter: Reporter
}

export const defaultLocatorOptions = {
  generatorsDir: "ingenr-generators"
}

type Generator = (input: Directive) => string

export class GeneratorLocator {
  private cache = new Map<string, Generator>()

  constructor(private options: LocatorOptions) {}

  get reporter() {
    return this.options.reporter
  }

  async bootstrap() {
    const genDir = this.generatorsDir
    if (!genDir) return
    try {
      const compilation: { [index: string]: (obj: any) => string } = (doT as any).process({
        path: genDir
      })
      /* istanbul ignore next */
      for (const [key, generate] of Object.entries(compilation)) {
        debug("Caching generator for %s", key)
        this.cache.set(key, (input: Directive) => generate(input.templateArgs))
      }
    } catch (e) {
      if (e.code !== "ENOENT") {
        throw e
      }
    }
  }

  async locate(name: string, filePath: string) {
    debug("Locating template: %s", name)
    if (!this.validateName(name, filePath)) return
    let generator = this.cache.get(name)
    if (generator) return generator
    const genDir = this.generatorsDir
    const requirables = [name]
    if (genDir) {
      requirables.unshift(path.resolve(genDir, name))
    }
    for (const requirable of requirables) {
      try {
        const required = require(requirable)
        generator = required.default || required
      } catch (e) {
        if (!e.message || !e.message.match(/cannot find module/i)) {
          throw e
        }
        debug(`Failed to require: ${requirable}`)
      }
    }
    if (!generator) {
      this.reporter.bufferWarning(filePath, undefined, undefined, [
        {
          message: `Failed to resolve generator: ${name}`
        }
      ])
      return
    }
    this.cache.set(name, generator)
    return generator
  }

  private get generatorsDir() {
    if (this.options.generatorsDir === false) return null
    if (this.options.generatorsDir === true) return defaultLocatorOptions.generatorsDir
    return this.options.generatorsDir
  }

  private validateName(name: string, filePath: string) {
    if (!name.match(/^([a-zA-Z0-9@_-]+\/?)+$/) || name.charAt(name.length - 1) === "/") {
      this.reporter.bufferWarning(filePath, undefined, undefined, [
        {
          message: `Invalid template name: ${name}`
        }
      ])
      return false
    }
    return true
  }
}
