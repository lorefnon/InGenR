import * as fs from "fs-extra"
import * as path from "path"
import * as tmp from "tmp"
import { run } from "."

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
  beforeEach(() => {
    originalCwd = process.cwd()
  })
  afterEach(async () => {
    process.chdir(originalCwd!)
    if (projDir) {
      fs.remove(projDir)
      projDir = null
    }
  })
  it("Injects generated content into annotated blocks", async () => {
    projDir = await getTmpDir()
    await populateFixtures(projDir!, ["src/index.ts", "ingenr-generators/knex-dal.dot"])
    process.chdir(projDir!)
    await run()
    const postProcessedContents = await fs.readFile(path.join(projDir!, "src/index.ts"), {
      encoding: "utf8"
    })
    expect(postProcessedContents).toMatchSnapshot()
  })
})
