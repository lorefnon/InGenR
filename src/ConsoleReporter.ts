import chalk, { Chalk } from "chalk"
import { isNumber } from "lodash"
import { WarningEntry } from "./warnings"

export interface Reporter {
  bufferWarning(
    filePath: string,
    lineIndex?: number,
    line?: string,
    warnings?: WarningEntry[]
  ): void
  reportAllWarnings(): void
}

export interface FileWarning {
  filePath: string
  lineIndex?: number
  line?: string
  warnings: WarningEntry[]
}

interface ConsoleReporterOptions {
  enableColor?: boolean
}

export const defaultReporterOptions: ConsoleReporterOptions = {
  enableColor: !! process.stdout.isTTY
}

export class ConsoleReporter implements Reporter {
  warnings: Map<string, FileWarning[]>
  console: Console
  chalk: Chalk;

  constructor(private options = defaultReporterOptions) {
    this.warnings = new Map()
    this.console = console
    this.chalk = new chalk.constructor({
      enabled: !!options.enableColor
    })
  }

  bufferWarning(
    filePath: string,
    lineIndex?: number,
    line?: string,
    warnings: WarningEntry[] = []
  ) {
    const fileWarnings = this.warnings.get(filePath) || []
    fileWarnings.push({ filePath, lineIndex, line, warnings })
    this.warnings.set(filePath, fileWarnings)
  }

  reportFileWarnings(fileWarnings: FileWarning[]) {
    if (!fileWarnings) return
    for (const { lineIndex, line, warnings } of fileWarnings) {
      for (const entry of warnings) {
        let preSpacer = ""
        if (isNumber(lineIndex)) {
          const lineNumRepr = `L:${lineIndex + 1} : `
          this.console.log(this.chalk.gray(lineNumRepr) + this.chalk.blue(line!))
          preSpacer = "^"
          let marginLeft = lineNumRepr.length
          if (entry.index) {
            marginLeft += entry.index
          }
          for (let i = 0; i < marginLeft; i++) {
            preSpacer = ` ${preSpacer}`
          }
        }
        this.console.log(this.chalk.red(`${preSpacer} ${entry.message}`))
        if (entry.error) {
          this.console.error(entry.error)
        }
      }
    }
  }

  reportAllWarnings() {
    for (const [filePath, fileWarnings] of this.warnings) {
      const count = fileWarnings.reduce((sum, fileWarning) => sum + fileWarning.warnings.length, 0)
      this.console.log(this.chalk.blue(`${filePath}: ${count} warnings`))
      this.reportFileWarnings(fileWarnings)
    }
  }
}
