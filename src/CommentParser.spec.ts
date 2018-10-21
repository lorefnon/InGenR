// @ts-ignore
import * as BufferStream from "node-bufferstream"
import * as path from "path"
import { CommentParser } from "./CommentParser"

const parseContent = async (content: string, filePath = path.join(__dirname, "__fixtures__", "src", "index.ts")) => {
  const stream = new BufferStream()
  const parser = new CommentParser(stream, filePath)
  const items: any[] = []
  return new Promise<any[]>((resolve, reject) => {
    parser.on("item", (item: any) => {
      if (item && item.data && item.data.templates) {
        item.data.templates.forEach((t: any) => {
          delete t.argsFile
        });
      }
      items.push(item)
    })
    parser.on("end", () => {
      resolve(items)
    })
    parser.on("error", reject)
    parser.parse()
    stream.write(content)
  })
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
      /*! InGenR:expand sample */
      /*! InGenR:end */

      /*! InGenR:expand knex-dal
      * ---
      * tableName: users
      * columns:
      *   - name: name
      *     type: string
      *   - name: email
      *     type: string
      */
      /*! InGenR:end */

      /*! InGenR:expand products
       * ---
       * tableName: products
       */
      /*! InGenR:end */
    `)
    expect(items).toMatchSnapshot()
  })

  it("parses directives with multiple templates", async () => {
    const items = await parseContent(`
      /*! InGenR:expand sample-1, sample-2 */
      /*! InGenR:end */
      
      /*! InGenR:expand sample-3, sample-4
      * foo: bar
      * hello: world
      */
      /*! InGenR:end */
    `);
    expect(items).toMatchSnapshot()
  });

  it("parses directives with external template args", async () => {
    const items = await parseContent(`
    /*! InGenR:expand knex-dal external-config.yaml*/
    /*! InGenR:end */
    `)
    
    expect(items).toMatchSnapshot()
  })

  it("parses directives with embedded templates", async () => {
    const items = await parseContent(`
    /*! InGenR:expand
     * ---
     * name: lorefnon
     * ---
     * <div>{{=it.name}}</div>
     */
    /*! InGenR:end */
    `)
    expect(items).toMatchSnapshot()
  })

})
