import * as fs from "fs-extra"
import * as path from "path"
import _debug from "debug"
import { file as getTmpFile } from "tmp"
import { GeneratorLocator } from "./GeneratorLocator"
import { CommentParser, Directive } from "./CommentParser"
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
    this.commentParser = new CommentParser(this.readStream, this.options.parser)
    const promise = this.commentParser.parse()
    try {
      await this.processComments()
      await promise
    } catch (e) {
      console.error(`Failed to process file: ${this.filePath}`)
      // await fs.remove(this.tmpFile.filePath);
      // throw e
    }
    this.writeStream.end()
    await Promise.all([readEndP, writeEndP])
    while (true) {
      try {
        await fs.rename(this.tmpFile.filePath, this.filePath)
        break
      } catch (e) {
        console.error(e)
      }
    }
  }

  private async processComments() {
    return new Promise((resolve, reject) => {
      let promise = Promise.resolve()
      this.commentParser!.on("item", async item => {
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
    } else if (type === "PARSED_BLOCK") {
      await this.processParsedBlock(data)
    }
    if (warnings && warnings.length > 0) {
      this.reporter.bufferWarning(this.filePath, lineIndex, data, warnings)
    }
  }

  private async processParsedBlock(directive: Directive) {
    debug("Processing directive", directive)
    const generate = await this.locator.locate(directive.templateName, this.filePath)
    if (!generate) {
      return
    }
    let targetStream = this.writeStream!
    let isExternalTarget = false
    if (directive.directiveArgs && directive.directiveArgs.targetFilePath) {
      const targetFilePath = path.resolve(path.dirname(this.filePath), directive.directiveArgs.targetFilePath)
      targetStream = fs.createWriteStream(targetFilePath)
      isExternalTarget = true
    }
    // tslint:disable-next-line
    const generatedContent = (await generate(directive)).replace(/\r\n/gm, "\n")
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

  private write(content: string, stream = this.writeStream!) {
    return new Promise((resolve, reject) => {
      if (!stream.write(content, "utf8")) {
        stream.once("drain", () => resolve(true))
      } else {
        process.nextTick(() => resolve(true))
      }
    })
  }
}
