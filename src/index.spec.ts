import * as fs from "fs-extra"
import * as path from "path"
import * as tmp from "tmp"
import { sortBy, flatten } from "lodash"
import { run, processProject } from "."
import { MockReporter } from "./MockReporter"

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

describe("InGenR", () => {
  let projDir: string | null = null
  let originalCwd: string | null = null

  const readFromProjDir = (filePath: string) => 
    fs.readFile(path.join(projDir!, filePath), {
      encoding: "utf8"
    })

  beforeEach(async () => {
    originalCwd = process.cwd()
    projDir = await getTmpDir()
    process.chdir(projDir)
  })
  afterEach(async () => {
    process.chdir(originalCwd!)
    if (projDir) {
      // fs.remove(projDir)
      projDir = null
    }
  })
  it("Injects generated content into annotated blocks", async () => {
    await populateFixtures(projDir!, ["src/index.ts", "ingenr-generators/knex-dal.dot"])
    await run()
    expect(await readFromProjDir("src/index.ts")).toMatchSnapshot()
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
            filePath: warning.filePath
              .replace(projDir!, "<project-root>")
              .replace(/\\/g, "/")
          }))
        )
      ),
      "filePath"
    )
    expect(strippedWarnings).toMatchSnapshot()
  })
  it.only("supports external template targets", async () => {
    await populateFixtures(projDir!, ["src/index.ts", "src/external-target.ts", "ingenr-generators/knex-dal.dot"])
    await run()
    const postProcessedContents = {
      index: await readFromProjDir("src/index.ts"),
      externalTarget: await readFromProjDir("src/external-target.ts"),
      externalTargetGenerated: await readFromProjDir("src/users-table.ts")
    };
    expect(postProcessedContents).toMatchSnapshot()
  })
})
