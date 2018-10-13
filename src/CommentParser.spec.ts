// @ts-ignore
import * as BufferStream from "node-bufferstream"
import { CommentParser } from "./CommentParser"

const parseContent = async (content: string) => {
  const stream = new BufferStream()
  const parser = new CommentParser(stream)
  const items: any[] = []
  parser.on("item", (item: any) => {
    items.push(item)
  })
  const promise = parser.parse()
  stream.write(content)
  await promise
  return items
}

describe("Comment Parser", () => {
  it("parses empty file", async () => {
    const items = await parseContent("")
    expect(items.length).toEqual(0)
  })

  it("parses files with no comment blocks", async () => {
    const items = await parseContent(`
            import express from "express";
            const app = express();
            app.listen()
        `)
    expect(items).toMatchSnapshot()
  })

  it("parses files with comment blocks", async () => {
    const items = await parseContent(`
            /**! InGenR:expand sample */
            /**! InGenR:end */

            /**! InGenR:expand knex-dal
            *
            * tableName: users
            * columns:
            *   - name: name
            *     type: string
            *   - name: email
            *     type: string
            */
            /**! InGenR:end */

            /**! InGenR:expand products
             *
             * tableName: products
             */
            /**! InGenR:end */
        `)
    expect(items).toMatchSnapshot()
  })
})
