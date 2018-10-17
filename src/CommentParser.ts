import { isNumber } from "./validators"
import { Readable } from "stream"
import * as EventEmitter from "events"
import * as fs from "fs"
import * as rl from "readline"
import * as yaml from "js-yaml"
import _debug from "debug"
import { WarningEntry, warnInterpolated, warnInvalidArgBody } from "./warnings"

const debug = _debug("InGenR:CommentParser")

export const defaultParserOptions = {
  commentStartRegex: "\\/\\*!",
  commentEndRegex: "\\*\\/",
  commentLBoundRegEx: "^\\s*\\*?",
  commentRBoundRegEx: "\\*?\\s*$"
}

interface Matchers {
  blockStartRegex: RegExp
  blockEndRegex: RegExp
  blockArgsBodyLineRegex: RegExp
  commentEndRegex: RegExp
}

export interface Directive {
  templateName: string
  templateArgs: any
  directiveArgs: {
    targetFilePath: string
  } | undefined
  blockStartLineIndex: number
  blockEndLineIndex: number
  currentContent?: string[]
  compiledContent?: string
}

export interface CandidateBlock extends Partial<Directive> {
  argsLines: string[]
  contentLines: string[]
}

enum ParserState {
  INIT = "INIT",
  IN_ARGS_BLOCK = "IN_ARGS_BLOCK",
  IN_GENERATED_BLOCK = "IN_GENERATED_BLOCK"
}

export class CommentParser extends EventEmitter {
  private matchers: Matchers
  private currentCandidate: CandidateBlock | null = null
  constructor(public inputStream: Readable, private parseOptions = defaultParserOptions) {
    super()
    this.matchers = {
      blockStartRegex: new RegExp(
        `${parseOptions.commentStartRegex}\\s+InGenR:expand\\s+(\\S*)\\s*($|${
          parseOptions.commentEndRegex
        })`
      ),
      blockEndRegex: new RegExp(
        `${parseOptions.commentStartRegex}\\s+InGenR:end\\s*${parseOptions.commentEndRegex}`
      ),
      blockArgsBodyLineRegex: new RegExp(
        `${parseOptions.commentLBoundRegEx}(.*)${parseOptions.commentRBoundRegEx}`
      ),
      commentEndRegex: new RegExp(`${parseOptions.commentEndRegex}`)
    }
    debug("Matchers:", this.matchers)
  }

  get parserState() {
    if (!this.currentCandidate) {
      return ParserState.INIT
    } else if (isNumber(this.currentCandidate.blockStartLineIndex)) {
      if (isNumber(this.currentCandidate.blockEndLineIndex)) {
        throw new Error("Invalid state encountered")
      }
      return ParserState.IN_GENERATED_BLOCK
    } else {
      return ParserState.IN_ARGS_BLOCK
    }
  }

  private parseLine(lineIndex: number, line: string) {
    debug("[ParserState: %s] Processing line %d: %s", this.parserState, lineIndex, line)
    const prevParserState = this.parserState
    let warnings: WarningEntry[] = []
    switch (prevParserState) {
      case ParserState.INIT:
        this.checkBlockStart(lineIndex, line, warnings)
        this.emitLine(lineIndex, line, prevParserState, warnings)
        break
      case ParserState.IN_ARGS_BLOCK:
        this.accumulateArgs(lineIndex, line, warnings)
        this.emitLine(lineIndex, line, prevParserState, warnings)
        break
      case ParserState.IN_GENERATED_BLOCK:
        this.checkGeneratedEnd(lineIndex, line, warnings)
        // @ts-ignore
        if (this.parserState === ParserState.INIT) {
          this.emitLine(lineIndex, line, prevParserState, warnings)
        }
    }
  }

  private emitLine(
    lineIndex: number,
    line: string,
    prevParserState: ParserState,
    warnings: WarningEntry[]
  ) {
    const unprocessed = prevParserState === this.parserState
    if (unprocessed) {
      this.checkUnprocessedDirectives(line, warnings)
    }
    this.emit("item", {
      type: "LINE",
      lineIndex,
      data: line,
      parserState: this.parserState,
      didProcess: !unprocessed,
      warnings
    })
  }

  private checkUnprocessedDirectives(line: string, warnings: WarningEntry[]) {
    const match = line.match(/InGenR:\S+/)
    if (!match) return
    warnings.push({
      index: match.index,
      message:
        `Potentially unprocessed InGenR directive: ${match[0]}.\n` +
        `If you expected this directive to be processed please recheck the syntax`
    })
  }

  private checkBlockStart(lineIndex: number, line: string, warnings: WarningEntry[]) {
    const match = line.match(this.matchers.blockStartRegex)
    if (!match || !match[1]) return
    if (match[0].trim().length !== line.trim().length) {
      warnings.push(warnInterpolated(match.index))
      return
    }
    this.currentCandidate = {
      templateName: match[1],
      argsLines: [],
      contentLines: []
    }
    if (match[2]) {
      // Closes on the same line
      this.currentCandidate.blockStartLineIndex = lineIndex + 1
    }
  }

  private accumulateArgs(lineIndex: number, line: string, warnings: WarningEntry[]) {
    const match = line.match(this.matchers.blockArgsBodyLineRegex)
    if (line.match(this.matchers.commentEndRegex)) {
      this.currentCandidate!.blockStartLineIndex = lineIndex + 1
      return
    }
    if (match) {
      this.currentCandidate!.argsLines.push(match[1])
      return
    }
    warnings.push(warnInvalidArgBody())
  }

  private checkGeneratedEnd(lineIndex: number, line: string, warnings: WarningEntry[]) {
    const match = line.match(this.matchers.blockEndRegex)
    if (!match) {
      this.currentCandidate!.contentLines.push(line)
      return
    }
    if (match[0].trim().length !== line.trim().length) {
      warnings.push(warnInterpolated(match.index))
      return
    }
    let templateArgs
    let directiveArgs
    try {
      ({templateArgs, directiveArgs} = this.parseArgs())
    } catch (e) {
      warnings.push({
        message: "Failed to parse template arguments. This directive will be discarded."
      })
      return
    }
    this.emit("item", {
      type: "PARSED_BLOCK",
      data: {
        templateName: this.currentCandidate!.templateName!,
        templateArgs,
        directiveArgs,
        blockStartLineIndex: this.currentCandidate!.blockStartLineIndex!,
        blockEndLineIndex: lineIndex,
        currentContent: this.currentCandidate!.contentLines
      },
      parserState: this.parserState
    })
    this.currentCandidate = null
  }

  private parseArgs() {
    const {argsLines} = this.currentCandidate!
    const separatorIndex = argsLines.findIndex(line => line.trim() === "---")
    let templateArgsBody: string | undefined
    let directiveArgsBody: string | undefined
    if (separatorIndex >= 0) {
      directiveArgsBody = argsLines.slice(0, separatorIndex).join("\n")
      templateArgsBody = argsLines.slice(separatorIndex + 1).join("\n")
    } else {
      templateArgsBody = argsLines.join("\n")
    }
    const result = {
      templateArgs: this.parseArgsBody(templateArgsBody),
      directiveArgs: this.parseArgsBody(directiveArgsBody)
    }
    debug("parsed directive args:", result)
    return result
  }

  private parseArgsBody(body: string | undefined) {
    if (!body) return null
    debug("Loading as yaml: %s", body)
    return yaml.safeLoad(body)
  }

  parse(): Promise<void> {
    return new Promise((resolve, reject) => {
      const lineReader = rl.createInterface({
        input: this.inputStream
      })
      let lineIndex = 0
      lineReader.on("line", line => {
        this.parseLine(lineIndex, line)
        lineIndex++
      })
      lineReader.on("error", e => reject(e))
      lineReader.on("close", () => {
        debug("[ParserState: %s] close", this.parserState)
        this.emit("close")
        if (this.parserState !== ParserState.INIT) {
          reject(new Error(`Unexpected End of File while parsing`))
          return
        }
        resolve()
      })
    })
  }
}
