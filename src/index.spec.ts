import * as fs from "fs-extra"
import * as path from "path"
import * as tmp from "tmp"
import { sortBy, flatten } from "lodash"
import { run, processProject } from "."
import { MockReporter } from "./MockReporter"
import { FileWarning } from "./ConsoleReporter"

const populateFixtures = async (projDir: string, filePaths: string[]) => {
  for (const filePath of filePaths) {
    const srcPath = path.join(__dirname, "__fixtures__", filePath)
    const destPath = path.join(projDir, filePath)
    await fs.ensureDir(path.dirname(destPath))
    const content = await fs.readFile(srcPath, { encoding: "utf8" })
    await fs.writeFile(destPath, content)
  }
}

const getTmpDir = () =>
  new Promise<string>((resolve, reject) => {
    tmp.dir({ keep: true }, (err, dir) => {
      if (err) reject(err)
      else resolve(dir)
    })
  })

describe("TemplateProcessor", () => {
  let projDir: string | null = null
  let originalCwd: string | null = null
  beforeEach(async () => {
    originalCwd = process.cwd()
    projDir = await getTmpDir()
    process.chdir(projDir)
  })
  afterEach(async () => {
    process.chdir(originalCwd!)
    if (projDir) {
      fs.remove(projDir)
      projDir = null
    }
  })
  it("Injects generated content into annotated blocks", async () => {
    await populateFixtures(projDir!, ["src/index.ts", "ingenr-generators/knex-dal.dot"])
    const postProcessedContents = await fs.readFile(path.join(projDir!, "src/index.ts"), {
      encoding: "utf8"
    })
    expect(postProcessedContents).toMatchSnapshot()
  })
  it("Complains about missing generators", async () => {
    const srcFiles = ["src/index.ts", "src/missing-generator.ts", "src/erroneous-template-name.ts"]
    await populateFixtures(projDir!, [...srcFiles, "ingenr-generators/knex-dal.dot"])
    const reporter = new MockReporter()
    await processProject(srcFiles.map(p => path.join(projDir!, p)), undefined, undefined, reporter)
    const strippedWarnings = sortBy(
      flatten(
        Array.from(reporter.warnings.values()).map(warnings =>
          warnings.map(warning => ({
            ...warning,
            filePath: warning.filePath.replace(projDir!, "<project-root>")
          }))
        )
      ),
      "filePath"
    )
    expect(strippedWarnings).toMatchSnapshot()
  })
})
