import chalk from "chalk"
import { WarningEntry } from "./warnings"

export interface Reporter {
  reportWarning(lineIndex: number, line: string, warnings: WarningEntry[]): void
}

export class ConsoleReporter {
  constructor(private options: {}) {}

  reportWarning(lineIndex: number, line: string, warnings: WarningEntry[]) {
    for (const entry of warnings) {
      const lineNumRepr = `L:${lineIndex + 1} : `
      console.log(chalk.gray(lineNumRepr) + chalk.blue(line))
      let preSpacer = "^"
      let marginLeft = lineNumRepr.length
      if (entry.index) {
        marginLeft += entry.index
      }
      for (let i = 0; i < marginLeft; i++) {
        preSpacer = ` ${preSpacer}`
      }
      console.log(chalk.red(`${preSpacer} ${entry.message}`))
      if (entry.error) {
        console.error(entry.error)
      }
    }
  }
}
