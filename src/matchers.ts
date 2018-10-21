import * as XRegExp from "xregexp"

export interface ParseOptions {
  commentStartRegex: string
  commentEndRegex: string
  commentLBoundRegEx: string
  commentRBoundRegEx: string
}

export const getMatchers = (p: ParseOptions) => ({
  commentStartRegex: XRegExp(
    `^(?<leadingSpace> \\s*)                             # leading space before the comment block begins
      ${p.commentStartRegex}
      (?<lineBody> .*?)
      (${p.commentRBoundRegEx}|(?<commentEnd> ${p.commentEndRegex}))
      \\s*$                                                # Trailing space 
      `,
    "x"
  ),
  expandDirectiveRegex: XRegExp(
    `^\\s*InGenR:expand
      (
        \\s+                                               # Optional inline directive arguments follow:
        (?<templateName> [^,\\s]+)                            # Template name
        (?<additionalTemplateNames> (\\s*,\\s*[^,\\s]+)*)     # Additional comma separated template names
                                                              # XRegExp unfortunately doesn't allow multiple groups
                                                              # with the same name, which would have been handy here.
        (\\s+(?<configFilePath> \\S+))?                    # Name of configuration file
      )?\\s*$                                              # Trailing space 
      `,
    "x"
  ),
  directiveEndRegex: XRegExp(`^\\s*InGenR:end\\s*$`, "x"),
  blockBodyLineRegex: XRegExp(
    `^\\s*
      ((?<preCommentEnd> ${p.commentEndRegex})|(
        ${p.commentLBoundRegEx}
        (?<lineBody> .*?)
        (${p.commentRBoundRegEx}|(?<postCommentEnd> ${p.commentEndRegex}))  
      ))
      \\s*$
      `,
    "x"
  ),
  commentEndRegex: XRegExp(`${p.commentEndRegex}`)
})
