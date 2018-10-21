import { getMatchers } from "./matchers";
import { defaultParserOptions } from "./CommentParser";
import * as XRegExp from "xregexp";

describe("getMatchers", () => {
    const matchers = getMatchers(defaultParserOptions)
    const testSnapshot = (obj: object) => {
        expect(obj ? Object.entries(obj) : obj).toMatchSnapshot();
    }
    test("commentStartRegex", () => {
        const exec = (str: string) => XRegExp.exec(str, matchers.commentStartRegex)
        testSnapshot(exec('/*!*/'))
        testSnapshot(exec('/*! foo */'))
        testSnapshot(exec('/*! foo bar baz */'))
        testSnapshot(exec('/*! foo'))
        testSnapshot(exec('/*! foo bar *'))
        testSnapshot(exec('   /*! foo bar * '))
        testSnapshot(exec('   /*! foo bar */ '))
        testSnapshot(exec('   /*! foo bar    */ '))
    })
    test("expandDirectiveRegex", () => {
        const exec = (str: string) => XRegExp.exec(str, matchers.expandDirectiveRegex)
        testSnapshot(exec('InGenR:expand'))
        testSnapshot(exec('   InGenR:expand  '))
        testSnapshot(exec('InGenR:expand tmplName'))
        testSnapshot(exec('InGenR:expand tmpl1,templ2'))
        testSnapshot(exec('InGenR:expand tmpl1, tmpl2'))
        testSnapshot(exec('InGenR:expand tmpl1, tmpl2, tmpl3,   tmpl4,tmpl5,foo/tmpl6,bar/tmpl-7, baz/Tmpl_9'))
        testSnapshot(exec(' InGenR:expand tmpl-1 some-config.yml '))
        testSnapshot(exec('InGenR:expand tmpl1, tmpl2 some-config.yml'))
        testSnapshot(exec('InGenR:expand tmpl1, tmpl2 someDir/some_sub_dir/some-config.yml'))
        testSnapshot(exec('  InGenR:expand tmpl1, tmpl2 someDir/some_sub_dir/some-config.yml  '))
        testSnapshot(exec(' InGenR:expand knex-table-interface config.yml '))
    })
    test("blockBodyLineRegex", () => {
        const exec = (str: string) => XRegExp.exec(str, matchers.blockBodyLineRegex)
        testSnapshot(exec('*'))
        testSnapshot(exec('* '))
        testSnapshot(exec('* foo *'))
        testSnapshot(exec('* key: value1, value2 *'))
        testSnapshot(exec('* key: {a: value1, b: value2} *'))
        testSnapshot(exec('* key: {a: value1, b: value2}'))
        testSnapshot(exec('**/'))
        testSnapshot(exec('* */'))
        testSnapshot(exec('* foo */'))
        testSnapshot(exec('* key: value1, value2 */'))
        testSnapshot(exec('*/'))
        testSnapshot(exec(''))
    })
    test("directiveEndRegex", () => {
        const exec = (str: string) => XRegExp.exec(str, matchers.directiveEndRegex)
        testSnapshot(exec('InGenR:end'))
        testSnapshot(exec(' InGenR:end '))
    })
})