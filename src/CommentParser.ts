import { isNumber } from "./validators"
import { Readable } from "stream"
import * as EventEmitter from "events"
import * as fs from "fs-extra"
import * as rl from "readline"
import * as yaml from "js-yaml"
import * as path from "path"
import _debug from "debug"
import { WarningEntry, warnInvalidArgBody } from "./warnings"
import { last } from "lodash"
import { ParseOptions, getMatchers } from "./matchers"
import * as XRegExp from "xregexp"

const debug = _debug("InGenR:CommentParser")

export const defaultParserOptions: ParseOptions = {
  commentStartRegex: "\\/\\*!",
  commentEndRegex: "\\*\\/",
  commentLBoundRegEx: "\\*?",
  commentRBoundRegEx: "\\*?"
}

export interface TemplateInvocation {
  name?: string
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
  templates: TemplateInvocation[]
  bodyLines: string[]
  contentLines: string[]
}

enum ParserState {
  INIT = "INIT",
  IN_COMMENT_BLOCK = "IN_COMMENT_BLOCK",
  IN_GENERATED_BLOCK = "IN_GENERATED_BLOCK"
}

export class CommentParser extends EventEmitter {
  private candidateStack: CandidateBlock[] = []
  private matchers: {
    commentStartRegex: RegExp
    expandDirectiveRegex: RegExp
    directiveEndRegex: RegExp
    blockBodyLineRegex: RegExp
    commentEndRegex: RegExp
  }

  constructor(
    public inputStream: Readable,
    private filePath: string,
    private parseOptions = defaultParserOptions
  ) {
    super()
    this.matchers = getMatchers(parseOptions)
    debug("Matchers:", this.matchers)
  }

  get currentCandidate() {
    return this.candidateStack[this.candidateStack.length - 1]
  }

  get numTemplates() {
    return this.candidateStack.reduce((sum, c) => sum + c.templates.length, 0)
  }

  get parserState() {
    if (this.candidateStack.length === 0) {
      return ParserState.INIT
    } else if (isNumber(this.currentCandidate.startLineIndex)) {
      if (isNumber(this.currentCandidate.endLineIndex)) {
        throw new Error("Invalid state encountered")
      }
      return ParserState.IN_GENERATED_BLOCK
    } else {
      return ParserState.IN_COMMENT_BLOCK
    }
  }

  private async parseLine(lineIndex: number, line: string) {
    debug("[ParserState: %s] Processing line %d: %s", this.parserState, lineIndex, line)
    const prevParserState = this.parserState
    const prevNumTemplates = this.numTemplates
    let warnings: WarningEntry[] = []
    if (prevParserState === ParserState.IN_COMMENT_BLOCK) {
      await this.processBlockBodyLine(lineIndex, line, warnings)
      this.emitLine(lineIndex, line, prevParserState, prevNumTemplates, warnings)
    } else {
      const didBlockStart = await this.checkBlockStart(lineIndex, line, warnings)
      if (didBlockStart || this.parserState === ParserState.INIT) {
        this.emitLine(lineIndex, line, prevParserState, prevNumTemplates, warnings)
      } else if (this.parserState === ParserState.IN_GENERATED_BLOCK) {
        for (const candidate of this.candidateStack) {
          candidate.contentLines.push(line)
        }
      }
    }
  }

  private emitLine(
    lineIndex: number,
    line: string,
    prevParserState: ParserState,
    prevNumTemplates: number,
    warnings: WarningEntry[]
  ) {
    const unprocessed =
      prevParserState === this.parserState && prevNumTemplates === this.numTemplates
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
    const match = XRegExp.exec(line, this.matchers.commentStartRegex)
    if (!match) return false
    await this.processBlockStart(lineIndex, line, warnings, match)
    return true
  }

  private async processBlockStart(
    lineIndex: number,
    line: string,
    warnings: WarningEntry[],
    match: any
  ) {
    if (XRegExp.exec(match.lineBody, this.matchers.directiveEndRegex)) {
      await this.handleDirectiveEnd(lineIndex, line, warnings)
      return true
    }
    const expandDirMatch = XRegExp.exec(match.lineBody, this.matchers.expandDirectiveRegex)
    if (expandDirMatch && this.candidateStack.length > 0) {
      warnings.push({
        message: "Nesting of directives is not allowed",
        index: match.index
      })
      return true
    }
    this.candidateStack.push({
      templates: [],
      bodyLines: [],
      contentLines: [],
      startLineIndex: undefined
    })
    if (expandDirMatch) {
      await this.checkExpandStart(expandDirMatch)
    }
    if (match.commentEnd) {
      if (expandDirMatch) {
        this.currentCandidate.startLineIndex = lineIndex + 1
      } else {
        this.candidateStack.pop()
        warnings.push({
          message: "Encountered single line comment block without any directive",
          index: match.index
        })
      }
    }
    return true
  }

  private async checkExpandStart(match: any) {
    const templateNames: string[] = []
    if (match.templateName) templateNames.push(match.templateName.trim())
    if (match.additionalTemplateNames) {
      templateNames.push(...(match.additionalTemplateNames as string).split(",").map(n => n.trim()))
    }
    this.currentCandidate.templates.push(...templateNames.filter(Boolean).map(name => ({ name })))
    if (match.configFilePath) {
      const { filePath, args } = await this.getArgsFromConfigFile(match.configFilePath)
      this.currentCandidate.templates.forEach(t => {
        t.argsFile = filePath
        t.args = args
      })
    }
    return true
  }

  private async getArgsFromConfigFile(configFilePath: string) {
    const filePath = path.resolve(path.dirname(this.filePath), configFilePath)
    const body = await fs.readFile(filePath, {
      encoding: "utf8"
    })
    const args = this.parseArgsBody(body)
    return { filePath, args }
  }

  private async handleDirectiveEnd(lineIndex: number, line: string, warnings: WarningEntry[]) {
    if (this.candidateStack.length === 0) {
      warnings.push({
        message: "There is no active InGenR directive to end"
      })
    } else {
      await this.processCandidates(lineIndex, line, warnings)
    }
  }

  private async processBlockBodyLine(lineIndex: number, line: string, warnings: WarningEntry[]) {
    const match: any = XRegExp.exec(line, this.matchers.blockBodyLineRegex)
    if (!match) {
      warnings.push(warnInvalidArgBody())
      return
    }
    const expandDirMatch = XRegExp.exec(match.lineBody, this.matchers.expandDirectiveRegex)
    if (expandDirMatch) {
      this.candidateStack.push({
        templates: [],
        bodyLines: [],
        contentLines: []
      })
      await this.checkExpandStart(expandDirMatch)
    } else {
      this.currentCandidate.bodyLines.push(match.lineBody)
    }
    if (match.preCommentEnd || match.postCommentEnd) {
      this.currentCandidate.startLineIndex = lineIndex + 1
    }
  }

  private async processCandidates(lineIndex: number, line: string, warnings: WarningEntry[]) {
    debug("Processing current stack of %d candidates", this.candidateStack.length)
    for (const candidate of this.candidateStack) {
      if (candidate.templates.length === 0 && candidate.bodyLines.length === 0) {
        debug("Skipping candidate having no templates and no body: %O", candidate)
        continue
      }
      await this.processCandidate(lineIndex, line, warnings, candidate)
    }
    debug("Finished processing candidates: Resetting candidateStack")
    this.candidateStack = []
  }

  private async processCandidate(
    lineIndex: number,
    line: string,
    warnings: WarningEntry[],
    candidate: CandidateBlock
  ) {
    debug("Processing candidate: %O", candidate)
    try {
      await this.parseArgs(candidate, warnings)
    } catch (e) {
      debug("exception when parsing args:", e)
      warnings.push({
        message: "Failed to parse template arguments. This directive will be discarded."
      })
      return
    }
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

  private async parseArgs(candidate: CandidateBlock, warnings: WarningEntry[]) {
    const { bodyLines, templates } = candidate
    if (!templates) {
      return
    }
    const sections = bodyLines.reduce(
      (sectionsAccumulator: string[][], line: string) => {
        if (line) {
          if (line.trim() === "---") {
            sectionsAccumulator.push([])
          } else {
            last(sectionsAccumulator)!.push(line)
          }
        }
        return sectionsAccumulator
      },
      [[]]
    )
    debug("Sections:", sections)
    if (sections.length > 3) {
      warnings.push({
        message: "Unexpected number of sections encountered in directive body"
      })
      return
    }
    if (sections.length === 0) {
      return
    }
    if (sections[0]) {
      candidate.args = this.parseArgsBody(sections[0].join("\n"))
    }
    if (sections[2]) {
      if (sections[2].length > 5) {
        warnings.push({
          message: "Usage of large inline templates is not recommended"
        })
      }
      const body = sections[2].join("\n")
      const template: TemplateInvocation = { body }

      if (candidate.templates.length === 1) {
        const tmpl = candidate.templates[0]
        if (tmpl.name && tmpl.name.match(/\.(json|yaml|yml)$/)) {
          const { filePath, args } = await this.getArgsFromConfigFile(tmpl.name)
          template.args = args
          template.argsFile = filePath
          candidate.templates.pop()
        }
      }
      if (candidate.templates.length > 0) {
        warnings.push({
          message:
            "Inline template will not override the named template. InGenR will try to resolve both."
        })
      }
      candidate.templates.push(template)
    }
    if (sections[1]) {
      const content = sections[1].join("\n")
      if (content.trim().length > 0) {
        const args = this.parseArgsBody(content)
        for (const template of templates) {
          template.args = args
        }
      }
    } else if (sections[0].length > 0) {
      warnings.push({
        message: "Did you forget to add a separator (---) before template arguments ? "
      })
    }
  }

  private parseArgsBody(body: string | undefined) {
    if (!body) return null
    debug("Loading as yaml: %s", body)
    return yaml.safeLoad(body)
  }

  relayError = (error: Error) => {
    this.emit("error", error)
  }

  parse() {
    const lineReader = rl.createInterface({
      input: this.inputStream
    })
    let lineIndex = 0
    let lineParseCompletionPromise = Promise.resolve()
    lineReader.on("line", line => {
      lineParseCompletionPromise = lineParseCompletionPromise
        .then(async () => {
          await this.parseLine(lineIndex, line)
          lineIndex++
        })
        .catch(this.relayError)
    })
    lineReader.on("error", this.relayError)
    lineReader.on("close", async () => {
      try {
        await lineParseCompletionPromise
        debug("[ParserState: %s] close", this.parserState)
        if (this.parserState !== ParserState.INIT) {
          debug("Unexpected parserState: %s", this.parserState)
          this.emit("error", new Error("Unexpected End of File while parsing"))
        } else {
          this.emit("end")
        }
      } catch (e) {
        this.relayError(e)
      }
    })
  }
}
