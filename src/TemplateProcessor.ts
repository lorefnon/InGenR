import * as fs from "fs-extra"
import * as path from "path"
import _debug from "debug"
import { file as getTmpFile } from "tmp"
import { GeneratorLocator } from "./GeneratorLocator"
import { CommentParser, Directive, TemplateInvocation } from "./CommentParser"
import { TopLevelOptions } from "."
import { WriteStream } from "tty"
import { ConsoleReporter, Reporter } from "./ConsoleReporter"
import { EventEmitter } from "stream"

const debug = _debug("InGenR:TemplateProcessor")

interface TmpFileHandle {
  filePath: string
  fd: number
}

interface TemplateProcessorHelpers {
  reporter: Reporter
  locator: GeneratorLocator
}

const getTmpFileAsync = () =>
  new Promise<TmpFileHandle>((resolve, reject) => {
    getTmpFile({ keep: true }, (err, filePath, fd) => {
      if (err) {
        reject(err)
      } else {
        resolve({ filePath, fd })
      }
    })
  })

const waitForEvent = (stream: EventEmitter, event: string) =>
  new Promise((resolve, reject) => {
    stream.on(event, resolve)
  })

export class TemplateProcessor {
  private readStream?: fs.ReadStream
  private didChange?: boolean
  private writeStream?: fs.WriteStream
  private tmpFile?: TmpFileHandle
  private commentParser?: CommentParser
  private reporter: Reporter
  private locator: GeneratorLocator

  constructor(
    private filePath: string,
    private options: TopLevelOptions,
    { reporter, locator }: TemplateProcessorHelpers
  ) {
    this.reporter = reporter
    this.locator = locator
  }

  async process() {
    this.readStream = fs.createReadStream(this.filePath, { encoding: "utf8" })
    const readEndP = waitForEvent(this.readStream, "close")
    this.tmpFile = await getTmpFileAsync()
    this.didChange = false
    this.writeStream = fs.createWriteStream(this.tmpFile.filePath)
    const writeEndP = waitForEvent(this.writeStream, "close")
    this.commentParser = new CommentParser(this.readStream, this.filePath, this.options.parser)
    let didParse = false
    const parseCompletionPromise = this.commentParser.parse()
    try {
      await this.processComments()
      await parseCompletionPromise
      didParse = true
    } catch (e) {
      debug("Processing error:", e)
      console.error(`Failed to process file: ${this.filePath}`)
      // tslint:disable-next-line
      fs.remove(this.tmpFile.filePath).catch(e => {
        console.error(`Failed to delete temporary file: ${this.tmpFile!.filePath}`)
        debug("Error:", e)
      })
    }
    this.writeStream.end()
    await Promise.all([readEndP, writeEndP])
    if (!didParse) return
    debug("Renaming %s -> %s", this.tmpFile.filePath, this.filePath)
    debugger
    await fs.rename(this.tmpFile.filePath, this.filePath)
  }

  private async processComments() {
    return new Promise((resolve, reject) => {
      let promise = Promise.resolve()
      this.commentParser!.on("item", item => {
        promise = promise.then(() => this.processItem(item)).catch(reject)
      })
      this.commentParser!.on("close", () => {
        promise.then(() => resolve(true)).catch(reject)
      })
    })
  }

  private async processItem({ type, lineIndex, data, didProcess, warnings }: any) {
    debug(`didProcess: ${didProcess} lineIndex: ${lineIndex} filePath: ${this.filePath}`)
    if (type === "LINE") {
      await this.write(`${data}\n`)
    } else if (type === "DIRECTIVE") {
      await this.processDirective(data)
    }
    if (warnings && warnings.length > 0) {
      this.reporter.bufferWarning(this.filePath, lineIndex, data, warnings)
    }
  }

  private async processTemplateInvocation(tmpl: TemplateInvocation, directive: Directive) {
    const generate = await this.locator.locate(tmpl, this.filePath)
    if (!generate) {
      debug("Failed to locate:", tmpl.name)
      return
    }
    let targetStream = this.writeStream!
    let isExternalTarget = false
    if (directive.args && directive.args.targetFilePath) {
      const targetFilePath = path.resolve(
        path.dirname(this.filePath),
        directive.args.targetFilePath
      )
      targetStream = fs.createWriteStream(targetFilePath)
      isExternalTarget = true
    }
    // tslint:disable-next-line
    const generatedContent = await this.postProcessGeneratedContent(await generate(tmpl))
    debug("Generated Content:", generatedContent)
    let prevGeneratedContent
    if (directive.currentContent) {
      prevGeneratedContent = directive.currentContent.join("\n")
      debug("Previous content:", prevGeneratedContent)
    }
    if (generatedContent === prevGeneratedContent) {
      await this.write(prevGeneratedContent, targetStream)
    } else {
      debug("Encountered change")
      this.didChange = true
      await this.write(generatedContent, targetStream)
    }
    if (isExternalTarget) targetStream.close()
  }

  private async postProcessGeneratedContent(content: string) {
    content = content.replace(/\r\n/gm, "\n")
    if (content.charAt(content.length - 1) !== "\n") {
      content = content + "\n"
    }
    return content
  }

  private async processDirective(directive: Directive) {
    debug("Processing directive", directive)
    for (const tmpl of directive.templates) {
      await this.processTemplateInvocation(tmpl, directive)
    }
  }

  private write(content: string, stream = this.writeStream!) {
    return new Promise((resolve, reject) => {
      const shouldWaitTillDrain = !stream.write(content, "utf8", (err) => {
        if (err) reject(err)
        else if (shouldWaitTillDrain) {
          stream.once("drain", () => resolve(true))
        } else {
          resolve(true)
        }
      })
    })
  }
}
