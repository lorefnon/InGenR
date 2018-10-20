import foo from "foo"

const bar = "bar"

/*! InGenR:expand knex-dahl
 * ---
 * tableName: users
 * columns:
 *   - name: name
 *     type: string
 */
/*! InGenR:end */

export { foo, bar }
