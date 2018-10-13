import * as fs from "fs"
import * as log from "fancy-log"
import _debug from "debug"
import { file as getTmpFile } from "tmp"
import { GeneratorLocator } from "./GeneratorLocator"
import { CommentParser, ParsedBlock } from "./CommentParser"
import { TopLevelOptions } from "."
import { WriteStream } from "tty"
import { ConsoleReporter, Reporter } from "./ConsoleReporter"

const debug = _debug("InGenR:TemplateProcessor")

interface TmpFileHandle {
  filePath: string
  fd: number
  clean(): void
}

interface TemplateProcessorHelpers {
  reporter: Reporter
  locator: GeneratorLocator
  fileSystem?: typeof fs
}

const getTmpFileAsync = () =>
  new Promise<TmpFileHandle>((resolve, reject) => {
    getTmpFile({ keep: true }, (err, filePath, fd, clean) => {
      if (err) {
        reject(err)
      } else {
        resolve({ filePath, fd, clean })
      }
    })
  })

export class TemplateProcessor {
  private readStream?: fs.ReadStream
  private didChange?: boolean
  private writeStream?: fs.WriteStream
  private tmpFile?: TmpFileHandle
  private commentParser?: CommentParser
  private reporter: Reporter
  private locator: GeneratorLocator
  private fs: typeof fs

  constructor(
    private filePath: string,
    private options: TopLevelOptions,
    { reporter, locator, fileSystem = fs }: TemplateProcessorHelpers
  ) {
    this.reporter = reporter
    this.locator = locator
    this.fs = fileSystem
  }

  async process() {
    this.readStream = this.fs.createReadStream(this.filePath, { encoding: "utf8" })
    this.tmpFile = await getTmpFileAsync()
    this.didChange = false
    this.writeStream = this.fs.createWriteStream(this.filePath)
    this.commentParser = new CommentParser(this.readStream, this.options.parser)
    const promise = this.commentParser.parse()
    try {
      await this.processComments()
      await promise
    } catch (e) {
      log.error(`Failed to process file: ${this.filePath}`)
      this.tmpFile.clean()
      throw e
    }
  }

  private async processComments() {
    return new Promise((resolve, reject) => {
      let promise = Promise.resolve()
      this.commentParser!.on("item", async item => {
        promise = promise.then(() => this.processItem(item)).catch(reject)
      })
      this.commentParser!.on("close", () => {
        promise.then(() => resolve(true))
      })
    })
  }

  private async processItem({ type, lineIndex, data, didProcess, warnings }: any) {
    debug(`didProcess: ${didProcess} lineIndex: ${lineIndex} filePath: ${this.filePath}`)
    if (type === "LINE") {
      this.writeStream!.write(`${data}\n`)
    } else if (type === "PARSED_BLOCK") {
      await this.processParsedBlock(data)
    }
    if (warnings && warnings.length > 0) {
      this.reporter.reportWarning(lineIndex, data, warnings)
    }
  }

  private async processParsedBlock(block: ParsedBlock) {
    const generate = await this.locator.locate(block.templateName)
    const generatedContent = (await generate(block)).replace(/\r\n/gm, "\n")
    debug("Generated Content:", generatedContent)
    let prevGeneratedContent
    if (block.currentContent) {
      prevGeneratedContent = block.currentContent.join("\n")
      debug("Previous content:", prevGeneratedContent)
    }
    if (generatedContent === prevGeneratedContent) {
      this.writeStream!.write(prevGeneratedContent)
    } else {
      debug("Encountered change")
      this.didChange = true
      this.writeStream!.write(generatedContent)
    }
  }
}
