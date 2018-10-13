import * as mock from "mock-fs"
import * as fs from "fs"
import * as path from "path"
import { run } from "."

const readFixtureSync = (filePath: string) =>
  fs.readFileSync(path.join(__dirname, "__fixtures__", filePath), {
    encoding: "utf8"
  })

describe("TemplateProcessor", () => {
  it("Injects generated content into annotated blocks", async () => {
    mock({
      "ingenr-generators": {
        "knex-dal.dot": readFixtureSync("ingenr-generators/knex-dal.dot")
      },
      src: {
        "index.ts": readFixtureSync("src/index.ts")
      }
    })
    await run()
    const data = fs.readFileSync("src/index.ts", { encoding: "utf8" })
    mock.restore()
    console.log("data =>", data)
  })
})
