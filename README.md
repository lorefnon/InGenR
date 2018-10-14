[![InGenR](https://raw.githubusercontent.com/lorefnon/InGenR/master/assets/banner.png)](https://github.com/lorefnon/InGenR)

InGenR (pronounced in-gen-r) is a generic utility for inline code generation.

When working with large codebases, esp. those involving (one or more) type systems it is often the case that reusing code (while retaining end-to-end type-safety) becomes difficult and repetitive boilerplate is required in some cases to satisfy the type system. Features like Type Classes and higher kinded polymorphism largely alleviate this problem, but if your language of choice doesn't have this feature, then you are pretty much stuck.

InGenR aims to be a simple generic utility that solves this through a much simpler and crude approach: code generation. For many use cases this is a much more practical and simple solution.

It is heavily inspired by [Crystal Macros](https://crystal-lang.org/docs/syntax_and_semantics/macros.html) and [Sinaps](https://github.com/janestreet/cinaps).

## Development Status

:warning: Early Alpha (Pre-Release)

[![Build Status](https://travis-ci.org/lorefnon/InGenR.svg?branch=master)](https://travis-ci.org/lorefnon/InGenR) [![Greenkeeper badge](https://badges.greenkeeper.io/lorefnon/InGenR.svg)](https://greenkeeper.io/) 
[![GitHub](https://img.shields.io/github/license/mashape/apistatus.svg)](https://github.com/lorefnon/InGenR/blob/master/LICENSE) [![Join the chat at https://gitter.im/InGenR/Lobby](https://badges.gitter.im/InGenR/Lobby.svg)](https://gitter.im/InGenR/Lobby?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)


## How does it work ?

1. Install ingenr:

```
npm install -g ingenr
```

2. Somewhere in your source file, add InGenR directives in comment blocks:

Eg. In `src/data-layer/users.ts`:`

```
/*! InGenR:expand knex-dal
*
* tableName: users
* columns:
*   - name: name
*     type: string
*   - name: email
*     type: string
*/
/*! InGenR:end */
```

An InGenR directive specifies the name of generator (knex-dal) and arguments passed to the generator (in YAML or JSON formats).

3. Write your code generator:

Eg. In `ingenr-generators/knex-dal.dot`:

```
interface {{= it.interfaceName || it.tableName }} {
    {{~ it.columns :c}}
    {{= c.fieldName || c.name }}: {{= c.tsType || c.type }};
    {{~}}
}

const createTable = () =>
    knex.schema.createTable("{{= it.tableName }}", (table) => {
        table.uuid("id").primary();
        {{~ it.columns :c}}
        table.{{= c.colType || c.type}}("{{= c.columnName || c.name }}")
        {{~}}
    })
```

Simple code generators can be implemented as [DoT templates](https://github.com/olado/doT). More complex generators can be implemented as  javascript modules (which export a generator function as the default export).

4. Run the generator:

```
$ ingenr ./src
```

InGenR will find all the files with annotated generator blocks like the above, and replace them in-place, modifying the source file with the expansion.

So after running this, `src/data-layer/users.ts` will contain:

```
/*! InGenR:expand knex-dal
 *
 * tableName: users
 * - columns:
 *   - name: name
 *     type: string
 *   - type: email
 *     type: string
 */
interface IUser {
    user: string;
    email: string;
}

const createTable = () =>
    knex.schema.createTable("users", (table) => {
        table.uuid("id").primary();
        table.string("user")
        table.string("email")
    })

/*! InGenR:end */
```

5. (Optional) Share your generator as a resuable package:

If a local template is not found, InGenR will try to `require` the specified template name.

Note that running the generator again will have no effect. InGenR checks the contents within the `InGenR:expand` and `InGenR:end` blocks and if the content matches what the generator would have generated, nothing will happen. If there is a mismatch - either because the template (or its arguments) have changed or the generated content has been edited manually, InGenR will replace the content within the block entirely.

You can commit the generated code, and verify the correctness of generated code through any linters, type checkers etc. that you are already familiar with.

## Isn't modifying source files risky ?

Not really !

InGenR does not modify any code outside of annotated expand blocks. It is safe to run it multiple times against the same source.

Having generated code live along-side source code in same file often simplifies use cases where expansions are desirable in nested scopes, within class declarations etc.

For small templates (primary use case) it also improves the readability and conveys the intent better. If you want the generated code to reside in dedicated files separate from your source directory, you are more than welcome to do so.

## Is InGenR type-safe / hygenic ?

No. InGenR is entirely unaware of what is being templated / replaced / generated. It is entirely language agnostic.

However, it makes it easy to retain your existing linters or type checkers and use them to check the safety of generated code.

## Is InGenR similar to C/C++ Macros ?

Yes, in the sense that both are text replacement utilities.

No, in the sense that InGenR is much more explicit and does not try to abstract away the transformations. The generated code is injected right in the source files and is expected to be checked-in.

It is expected that this discourages overuse of macros/templates for things which can be easily achieved through language features.

## Why not write babel plugins or Sweet.js macros instead ?

Writing AST transformations is often more cumbersome than text based templates.

Making them play well with TypeScript (or other type systems) and static analyzers can be difficult.

## What languages are supported ?

InGenR itself is language agnostic and can be used with any language.

However, if your language natively supports compile time macros (eg. Haxe, Scala, Clojure etc.) or higher order polymorphism (eg. Haskell), or you are happy with dynamic metaprogramming (eg. Ruby, Lisp) then this project may not be useful for you.

It is strongly advised that generated code be run through a linter / syntax-checker after generation because InGenR does not guarantee syntactic validity of generated code.
