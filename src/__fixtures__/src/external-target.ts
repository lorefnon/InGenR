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
/*! InGenR:end */

export { foo, bar }
