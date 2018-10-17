import { sortBy, flatten } from "lodash"
import { Reporter, ConsoleReporter } from "./ConsoleReporter"

export class MockReporter extends ConsoleReporter {
  // tslint:disable-next-line:no-empty
  reportAllWarnings() {}

  stripWarnings(projectDir: string) {
    return sortBy(
      flatten(
        Array.from(this.warnings.values()).map(warnings =>
          warnings.map(warning => ({
            ...warning,
            filePath: warning.filePath.replace(projectDir, "<project-root>").replace(/\\/g, "/")
          }))
        )
      ),
      "filePath"
    )
  }
}
