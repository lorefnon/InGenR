import * as fs from "fs-extra"
import * as path from "path"
import * as tmp from "tmp"
import _debug from "debug"
import { run, processProject } from "."
import { MockReporter } from "./MockReporter"
import { MockLocator } from "./MockLocator"

const debug = _debug("InGenR:spec:index")

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
    tmp.dir((err, dir) => {
      if (err) reject(err)
      else resolve(dir)
    })
  })

describe("InGenR", () => {
  let projDir: string | null = null
  let originalCwd: string | null = null

  const readFromProjDir = (filePath: string) =>
    fs.readFile(path.join(projDir!, filePath), { encoding: "utf8" })

  const readFromFixturesDir = (filePath: string) =>
    fs.readFile(path.join(__dirname, "__fixtures__", filePath), { encoding: "utf8" })

  beforeEach(async () => {
    originalCwd = process.cwd()
    projDir = await getTmpDir()
    debug("Switching to temporary project directory:", projDir)
    process.chdir(projDir)
  })

  afterEach(async () => {
    debug("Switching to original directory:", originalCwd)
    process.chdir(originalCwd!)
    if (projDir) {
      // tslint:disable-next-line
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
    const erroneousFiles = ["src/missing-generator.ts", "src/erroneous-template-name.ts"]
    const correctFiles = ["src/index.ts"]
    const srcFiles = [...correctFiles, ...erroneousFiles]
    await populateFixtures(projDir!, [...srcFiles, "ingenr-generators/knex-dal.dot"])
    const reporter = new MockReporter()
    await processProject(srcFiles.map(p => path.join(projDir!, p)), undefined, undefined, reporter)
    expect(reporter.stripWarnings(projDir!)).toMatchSnapshot()
    expect(await readFromProjDir("src/index.ts")).toMatchSnapshot()
    for (const f of erroneousFiles) {
      expect(await readFromProjDir(f)).toEqual(await readFromFixturesDir(f))
    }
  })

  it("supports external template targets", async () => {
    await populateFixtures(projDir!, [
      "src/index.ts",
      "src/external-target.ts",
      "ingenr-generators/knex-dal.dot"
    ])
    await run()
    expect(await readFromProjDir("src/index.ts")).toMatchSnapshot()
    expect(await readFromProjDir("src/external-target.ts")).toMatchSnapshot()
    expect(await readFromProjDir("src/users-table.ts")).toMatchSnapshot()
  })

  it("supports multiple targets and generator modules", async () => {
    const srcFiles = ["src/multiple-targets.ts"]
    await populateFixtures(projDir!, srcFiles)
    const mockReporter = new MockReporter()
    const mockLocator = new MockLocator({
      reporter: mockReporter,
      generatorsDir: true
    })
    mockLocator.mockGenerators.set("pg-dal", {
      default: () => `hello world`
    })
    mockLocator.mockGenerators.set(
      path.join(projDir!, "ingenr-generators", "sqlite-dal"),
      () => `lorem ipsum`
    )
    await processProject(
      srcFiles.map(p => path.join(projDir!, p)),
      undefined,
      mockLocator,
      mockReporter
    )
    expect(await readFromProjDir("src/multiple-targets.ts")).toMatchSnapshot()
    expect(mockReporter.stripWarnings(projDir!)).toMatchSnapshot()
  })

  it("supports external configuration", async () => {})
})
