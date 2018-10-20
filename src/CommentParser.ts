import { isNumber } from "./validators"
import { Readable } from "stream"
import * as EventEmitter from "events"
import * as fs from "fs-extra"
import * as rl from "readline"
import * as yaml from "js-yaml"
import * as path from "path"
import _debug from "debug"
import { WarningEntry, warnInterpolated, warnInvalidArgBody, warnInvalidExpandArgs } from "./warnings"
import { last } from "lodash";

const debug = _debug("InGenR:CommentParser")

export const defaultParserOptions = {
  commentStartRegex: "\\/\\*!",
  commentEndRegex: "\\*\\/",
  commentLBoundRegEx: "^\\s*\\*?",
  commentRBoundRegEx: "\\*?\\s*$"
}

interface Matchers {
  directiveStartRegex: RegExp
  directiveEndRegex: RegExp
  secondaryExpandStartRegex: RegExp
  blockArgsBodyLineRegex: RegExp
  commentEndRegex: RegExp
}

export interface TemplateInvocation {
  name: string
  argsFile?: string
  args?: any
  body?: string
}

export interface Directive {
  templates: TemplateInvocation[]
  args:
    | {
        targetFilePath: string
      }
    | undefined
  startLineIndex: number
  endLineIndex: number
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
  private candidatesQ: CandidateBlock[] = []
  constructor(public inputStream: Readable, private filePath: string, private parseOptions = defaultParserOptions) {
    super()
    const expandRegex = '\\s+InGenR:expand\\s+(.*)\\s*';
    const p = parseOptions
    this.matchers = {
      directiveStartRegex: new RegExp(
        `${p.commentStartRegex}${expandRegex}($|${p.commentEndRegex}|${p.commentRBoundRegEx})`
      ),
      directiveEndRegex: new RegExp(
        `${p.commentStartRegex}\\s+InGenR:end\\s*${p.commentEndRegex}`
      ),
      secondaryExpandStartRegex: new RegExp(
        `${p.commentStartRegex}${expandRegex}($|${p.commentEndRegex}|${p.commentRBoundRegEx})`
      ),
      blockArgsBodyLineRegex: new RegExp(
        `${p.commentLBoundRegEx}(.*)${p.commentRBoundRegEx}`
      ),
      commentEndRegex: new RegExp(`${p.commentEndRegex}`)
    }
    debug("Matchers:", this.matchers)
  }

  get currentCandidate() {
    return this.candidatesQ[this.candidatesQ.length - 1]
  }

  get parserState() {
    if (this.candidatesQ.length === 0) {
      return ParserState.INIT
    } else if (isNumber(this.currentCandidate.startLineIndex)) {
      if (isNumber(this.currentCandidate.endLineIndex)) {
        throw new Error("Invalid state encountered")
      }
      return ParserState.IN_GENERATED_BLOCK
    } else {
      return ParserState.IN_ARGS_BLOCK
    }
  }

  private async parseLine(lineIndex: number, line: string) {
    debug("[ParserState: %s] Processing line %d: %s", this.parserState, lineIndex, line)
    const prevParserState = this.parserState
    let warnings: WarningEntry[] = []
    switch (prevParserState) {
      case ParserState.INIT:
        await this.checkBlockStart(lineIndex, line, warnings)
        this.emitLine(lineIndex, line, prevParserState, warnings)
        break
      case ParserState.IN_ARGS_BLOCK:
        const didSecondaryExpandStart = await this.checkSecondaryExpandStart(lineIndex, line, warnings);
        if (!didSecondaryExpandStart) {
          this.accumulateArgs(lineIndex, line, warnings)
        }
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

  private async checkBlockStart(lineIndex: number, line: string, warnings: WarningEntry[]) {
    const match = line.match(this.matchers.directiveStartRegex)
    if (!match || !match[1]) return false
    if (match[0].trim().length !== line.trim().length) {
      warnings.push(warnInterpolated(match.index))
      return false
    }
    return this.checkExpandStart(lineIndex, line, warnings, match)
  }

  private async checkSecondaryExpandStart(lineIndex: number, line: string, warnings: WarningEntry[]) {
    const match = line.match(this.matchers.secondaryExpandStartRegex)
    if (!match || !match[1]) return false
    this.currentCandidate!.endLineIndex = lineIndex - 1;
    return this.checkExpandStart(lineIndex, line, warnings, match)
  }

  private async checkExpandStart(lineIndex: number, line: string, warnings: WarningEntry[], match: RegExpMatchArray) {
    const inlineExpandArgs = match[1].trim().split(/(,|\s)\s*/)
    const templateNames: string[] = [];
    const extraneousArgs: string[] = [];
    let currentTarget = templateNames;
    for (const arg of inlineExpandArgs) {
      if (arg === ',') {
        continue;
      } else if (arg === ' ') {
        currentTarget = extraneousArgs;
      } else {
        currentTarget.push(arg)
      }
    } 
    if (extraneousArgs.length > 1 || templateNames.length < 1) {
      warnings.push(warnInvalidExpandArgs(match.index))
      return false
    }
    const currentCandidate: CandidateBlock = {
      templates: templateNames.map(name => ({
        name
      })),
      argsLines: [],
      contentLines: [],
      startLineIndex: match[2] ? lineIndex + 1 : undefined
    }
    if (extraneousArgs[0]) {
      const argsFilePath = path.resolve(path.dirname(this.filePath), extraneousArgs[0])
      const body = await fs.readFile(argsFilePath, {
        encoding: 'utf8'
      })
      const parsedBody = this.parseArgsBody(body)
      currentCandidate.templates!.forEach(t => {
        t.argsFile = argsFilePath
        t.args = parsedBody
      })
    }
    this.candidatesQ.push(currentCandidate)
    return true
  }

  private accumulateArgs(lineIndex: number, line: string, warnings: WarningEntry[]) {
    const match = line.match(this.matchers.blockArgsBodyLineRegex)
    if (line.match(this.matchers.commentEndRegex)) {
      this.currentCandidate!.startLineIndex = lineIndex + 1
      return
    }
    if (match) {
      this.currentCandidate!.argsLines.push(match[1])
      return
    }
    warnings.push(warnInvalidArgBody())
  }

  private checkGeneratedEnd(lineIndex: number, line: string, warnings: WarningEntry[]) {
    const match = line.match(this.matchers.directiveEndRegex)
    if (!match) {
      for (const candidate of this.candidatesQ) {
        candidate.contentLines.push(line)
      }
      return
    }
    if (match[0].trim().length !== line.trim().length) {
      warnings.push(warnInterpolated(match.index))
      return
    }
    for (const candidate of this.candidatesQ) {
      this.finishProcessingCandidate(lineIndex, line, warnings, candidate)
    }
    this.candidatesQ = [] 
  }

  private finishProcessingCandidate(lineIndex: number, line: string, warnings: WarningEntry[], candidate: CandidateBlock) {
    try {
      this.parseArgs(candidate, warnings)
    } catch (e) {
      warnings.push({
        message: "Failed to parse template arguments. This directive will be discarded."
      })
      return
    }
    for (const candidate of this.candidatesQ) {
      this.emit("item", {
        type: "DIRECTIVE",
        data: {
          templates: candidate.templates,
          args: candidate.args,
          startLineIndex: candidate.startLineIndex!,
          endLineIndex: candidate.endLineIndex || lineIndex,
          currentContent: candidate.contentLines  
        },
        parserState: this.parserState
      })
    }
  }

  private parseArgs(candidate: CandidateBlock, warnings: WarningEntry[]) {
    const {argsLines, templates} = candidate
    if (!templates) {
      return
    }
    const sections = argsLines.reduce((sectionsAccumulator: string[][], line: string) => {
      if (line.trim() === "---") {
        sectionsAccumulator.push([])
      } else {
        last(sectionsAccumulator)!.push(line)
      }
      return sectionsAccumulator
    }, [[]]);
    if (sections.length > 3) {
      warnings.push({
        message: 'Unexpected number of sections encountered in directive body'
      })
      return
    }
    if (sections.length === 0) {
      return;
    }
    for (const template of templates) {
      if (sections.length === 1) {
        if (template.argsFile) {
          candidate.args = this.parseArgsBody(sections[0].join("\n"))
        } else {
          template.args = this.parseArgsBody(sections[0].join("\n"))
        }
      } else {
        candidate.args = candidate.args || this.parseArgsBody(sections[0].join("\n"))
        template.args = this.parseArgsBody(sections[1].join("\n"))
        if (sections[2]) {
          template.body = sections[2].join("\n")
        }
      }
    }
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
      let lineParseCompletionPromise = Promise.resolve()
      lineReader.on("line", (line) => {
        lineParseCompletionPromise = lineParseCompletionPromise
          .then(async () => {
            await this.parseLine(lineIndex, line)
            lineIndex++;
          })
          .catch(reject);
      })
      lineReader.on("error", e => reject(e))
      lineReader.on("close", () => {
        debug("[ParserState: %s] close", this.parserState)
        this.emit("close")
        if (this.parserState !== ParserState.INIT) {
          reject(new Error(`Unexpected End of File while parsing`))
          return
        }
        lineParseCompletionPromise.then(resolve)
      })
    })
  }
}
