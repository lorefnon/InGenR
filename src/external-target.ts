import foo from "foo"

const bar = "bar"

/*! InGenR:expand knex-dal
 *
 * targetFilePath: users-table.ts
 * ---
 * tableName: users
 * columns:
 *   - name: name
 *     type: string
 *   - name: email
 *     type: string
 */
interface users {
  name: string;
  email: string;
  
}

const createTable = () =>
  knex.schema.createTable("users", (table) => {
      table.uuid("id").primary();
      table.string("name")
      table.string("email")
      
  })
/*! InGenR:end */

export { foo, bar }
