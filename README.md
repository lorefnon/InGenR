[![InGenR](https://raw.githubusercontent.com/lorefnon/InGenR/master/assets/banner.png)](https://github.com/lorefnon/InGenR)

InGenR (pronounced *in-gen-are*) is a generic utility for inline code generation.

When working with large codebases, esp. those involving (one or more) type systems it is often the case that reusing code (while retaining end-to-end type-safety) becomes difficult and repetitive boilerplate is required in some cases to satisfy the type system. 

Features like [Higher kinded polymorphism](https://sidburn.github.io/blog/2016/03/24/higher-kinded-polymorphism) largely alleviate this problem, but if your language of choice doesn't have such features, then you are pretty much stuck. It is not always feasible or practical to switch to a language with an advanced type system to eliminate redundancy in some parts of your application.

InGenR aims to be a simple generic utility that solves this through a much simpler and crude approach: **code generation**. For many use cases this is a much more practical and simple solution. You can [get started](#how-does-it-work-) in a matter of seconds.  available [features](#features).

**:sparkles: InGenR puts a very high emphasis on DX:**

  :sunny: Clear unambiguous error messages.

  :sunny: There is a small clear set of rules - no complex DSLs to learn, no surprises, no magic.

  :sunny: Plays well with the tools (linters, type-checkers, loaders, etc.) which you already have in place.

  :sunny: Utilities to ensure generated code doesn't look malformatted, incorrectly indented or out of place in your code. (**TODO**)

  It is heavily inspired by [Crystal Macros](https://crystal-lang.org/docs/syntax_and_semantics/macros.html) and [Sinaps](https://github.com/janestreet/cinaps).

## Development Status

:warning: Beta :hatched_chick:

[![Build Status](https://travis-ci.org/lorefnon/InGenR.svg?branch=master)](https://travis-ci.org/lorefnon/InGenR) 
[![SonarCloud badge](https://sonarcloud.io/api/project_badges/measure?project=lorefnon_InGenR&metric=alert_status)](https://sonarcloud.io/dashboard?id=lorefnon_InGenR)
[![Greenkeeper badge](https://badges.greenkeeper.io/lorefnon/InGenR.svg)](https://greenkeeper.io/) 
[![GitHub](https://img.shields.io/github/license/mashape/apistatus.svg)](https://github.com/lorefnon/InGenR/blob/master/LICENSE) 
[![Join the chat at https://gitter.im/InGenR/Lobby](https://badges.gitter.im/InGenR/Lobby.svg)](https://gitter.im/InGenR/Lobby?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

## How does it work ?

1. **Add InGenR directives to your source files in comment blocks:**

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

2. **Write/install your code generator:**

    The code generator specified by your directive (here `knex-dal`) can either reside locally (in a `<project-root>/ingenr-generators` directory) or in an npm package.

    A generator can be a simple doT template, eg. In `ingenr-generators/knex-dal.dot`:

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

    Or a plain javascript module, eg. in `ingenr-generators/knex-dal.js`:

    ```js
    export default async () => {
        const result = await getListOfRowsFromDB();
        return result.toJSON();
    }
    ```

    Note that our generator can be asynchronous and can do anything that is possible through node.js eg. connect to databases, connect to external resources, use your favorite templating library etc. This is powerful :sunglasses: because you can use any language that compiles to javascript and typecheck or test your generators  

    See [configuration](#configuration) below to change the location of the directory where InGenR will look for generators.

    Also this generator doesn't have to be local to your project. If a local generator was not found InGenR will try to require `knex-dal`. This means that you can create and share your generators through npm modules and use them across projects.

3. **Run the generator:**

    ```
    $ npx ingenr run ./src/**/*
    ```

    Don't already have npx ? Read more [here](https://www.npmjs.com/package/npx). 

    InGenR will find all the files with InGenR directives like the above, and expand them in place.

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

    The result of the generator will be injected right into the source file between the InGenR directive comment blocks.

    Note that running the generator again will have no effect. InGenR checks the contents within the `InGenR:expand` and `InGenR:end` blocks and if the content matches what the generator would have generated, nothing will happen. If there is a mismatch - either because the template (or its arguments) have changed or the generated content has been edited manually, InGenR will replace the content within the block entirely.

    You can commit the generated code, and verify the correctness of generated code through any linters, type checkers etc. that you are already familiar with.

## :gem: Features

### In place or external templates: 

While most of the use cases are served well through in place expansion, in some cases (eg. when you are dealing with multiple languages) it is desirable that the template expands into new files. 

This is possible by specifying `targetFilePath` (relative to path of current file):

```
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
```

This will populate users-table.ts file with the result of the generator.

Note that the arguments before `---` are arguments to the directive itself, where as the arguments after `---` are passed on to the generator.

### Multiple targets:

It is sometimes convenient to invoke multiple generators with the same set of arguments in a single directive: 

```
/*! InGenR:expand foo, bar
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

## Caveats

- To be safe ensure that your files are checked in before running the generator. While InGenR is in beta, we don't recommend running it in pre-commit hooks or as a part of automated pipelines. 

  Please [report](https://github.com/lorefnon/InGenR/issues) any bugs or unexpected behavior that you encounter.

- InGenR does not run the generators in a sandboxed environment. If you are using external generators, make sure you trust their authors.

- InGenR doesn't sanitize the input, or validate the output because doing this in a way that works across languages is hard. Please make sure that you review the inputs that are passed to the templates and validate the outputs through a linter or type-checker.

## Contributing

We welcome your contributions. Read more [here](https://github.com/lorefnon/InGenR/blob/master/contributing/README.md).

## FAQs

### Isn't modifying source files risky ?

Not really !

InGenR does not modify any code outside of annotated expand blocks. It is safe to run it multiple times against the same source.

Having generated code live along-side source code in same file often simplifies use cases where expansions are desirable in nested scopes, within class declarations etc.

For small templates (primary use case) it also improves the readability and conveys the intent better. If you want the generated code to reside in dedicated files separate from your source directory, you are more than welcome to do so.

### Is InGenR type-safe / hygenic ?

No. InGenR is entirely unaware of what is being templated / replaced / generated. It is entirely language agnostic.

However, it makes it easy to retain your existing linters or type checkers and use them to check the safety of generated code.

### Is InGenR similar to C/C++ Macros ?

Yes, in the sense that both are text replacement utilities.

No, in the sense that InGenR is much more **explicit** and does not try to abstract away the transformations. The generated code is injected right in the source files and is expected to be checked-in.

It is expected that this discourages overuse of macros/templates for things which can be easily achieved through language features.

### Why not write babel plugins or Sweet.js macros instead ?

Writing AST transformations is often more cumbersome than text based templates.

Making them play well with TypeScript (or other type systems) and static analyzers can be difficult.

### What languages are supported ?

InGenR itself is language agnostic and can be used with any language.

However, if your language natively supports compile time macros (eg. Haxe, Scala, Clojure etc.) or higher order polymorphism (eg. Haskell), or you are happy with dynamic metaprogramming (eg. Ruby, Lisp) then this project may not be useful for you.

It is strongly advised that generated code be run through a linter / syntax-checker after generation because InGenR does not guarantee syntactic validity of generated code.
