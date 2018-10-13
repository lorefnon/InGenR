import { isNumber } from './validators'
import { Readable } from "stream"
import * as EventEmitter from 'events'
import * as fs from 'fs'
import * as rl from 'readline'
import * as yaml from 'js-yaml'
import _debug from 'debug'

const debug = _debug('InGenR:CommentParser')

export const defaultParserOptions = {
    commentStartRegex: '\\/\\*\\*!',
    commentEndRegex: '\\*\\/',
    commentLBoundRegEx: '^\\s*\\*?',
    commentRBoundRegEx: '\\*?\\s*$'
}

interface Matchers {
    blockStartRegex: RegExp
    blockEndRegex: RegExp
    blockArgsBodyLineRegex: RegExp
    commentEndRegex: RegExp
}

export interface ParsedBlock {
    templateName: string
    templateArgs: any
    blockStartLineIndex: number
    blockEndLineIndex: number
    currentContent?: string[]
    compiledContent?: string
}

export interface CandidateBlock extends Partial<ParsedBlock> {
    argsLines: string[]
    contentLines: string[]
}

enum ParserState {
    INIT = 'INIT',
    IN_ARGS_BLOCK = 'IN_ARGS_BLOCK',
    IN_GENERATED_BLOCK = 'IN_GENERATED_BLOCK'
}

export class CommentParser extends EventEmitter {
    private matchers: Matchers
    private currentCandidate: CandidateBlock | null = null
    constructor(public inputStream: Readable, private parseOptions = defaultParserOptions) {
        super()
        this.matchers = {
            blockStartRegex: new RegExp(
                `${parseOptions.commentStartRegex}\\s+InGenR:expand\\s+(\\S*)\\s*($|${
                parseOptions.commentEndRegex
                })`
            ),
            blockEndRegex: new RegExp(
                `${parseOptions.commentStartRegex}\\s+InGenR:end\\s*${parseOptions.commentEndRegex}`
            ),
            blockArgsBodyLineRegex: new RegExp(
                `${parseOptions.commentLBoundRegEx}(.*)${parseOptions.commentRBoundRegEx}`
            ),
            commentEndRegex: new RegExp(`${parseOptions.commentEndRegex}`)
        }
        debug('Matchers:', this.matchers)
    }

    get parserState() {
        if (!this.currentCandidate) {
            return ParserState.INIT
        } else if (isNumber(this.currentCandidate.blockStartLineIndex)) {
            if (isNumber(this.currentCandidate.blockEndLineIndex)) {
                throw new Error('Invalid state encountered')
            }
            return ParserState.IN_GENERATED_BLOCK
        } else {
            return ParserState.IN_ARGS_BLOCK
        }
    }

    private parseLine(lineIndex: number, line: string) {
        debug('[ParserState: %s] Processing line %d: %s', this.parserState, lineIndex, line)
        switch (this.parserState) {
            case ParserState.INIT:
                this.checkBlockStart(lineIndex, line)
                this.emitLine(line)
                break
            case ParserState.IN_ARGS_BLOCK:
                this.accumulateArgs(lineIndex, line)
                this.emitLine(line)
                break
            case ParserState.IN_GENERATED_BLOCK:
                this.checkGeneratedEnd(lineIndex, line)
                // @ts-ignore
                if (this.parserState === ParserState.INIT) {
                    this.emitLine(line)
                }
        }
    }

    private emitLine(line: string) {
        this.emit('item', { type: 'LINE', data: line, parserState: this.parserState })
    }

    private checkBlockStart(lineIndex: number, line: string) {
        const match = line.match(this.matchers.blockStartRegex)
        if (!match || !match[1]) return
        this.currentCandidate = {
            templateName: match[1],
            argsLines: [],
            contentLines: []
        }
        if (match[2]) {
            // Closes on the same line
            this.currentCandidate.blockStartLineIndex = lineIndex + 1
        }
    }

    private accumulateArgs(lineIndex: number, line: string) {
        const match = line.match(this.matchers.blockArgsBodyLineRegex)
        if (line.match(this.matchers.commentEndRegex)) {
            this.currentCandidate!.blockStartLineIndex = lineIndex + 1
            return
        }
        if (match) {
            this.currentCandidate!.argsLines.push(match[1])
            return
        }
        throw new Error(`Invalid line in args body: ${lineIndex + 1}`)
    }

    private checkGeneratedEnd(lineIndex: number, line: string) {
        const match = line.match(this.matchers.blockEndRegex)
        if (!match) {
            this.currentCandidate!.contentLines.push(line)
            return
        }
        this.emit('item', {
            type: 'PARSED_BLOCK',
            data: {
                templateName: this.currentCandidate!.templateName!,
                templateArgs: this.parseTemplateArgs(),
                blockStartLineIndex: this.currentCandidate!.blockStartLineIndex!,
                blockEndLineIndex: lineIndex,
                currentContent: this.currentCandidate!.contentLines
            },
            parserState: this.parserState
        })
        this.currentCandidate = null
    }

    private parseTemplateArgs() {
        const argsBody = this.currentCandidate!.argsLines.join('\n')
        debug('Loading as yaml: %s', argsBody)
        return yaml.safeLoad(argsBody)
    }

    parse(): Promise<void> {
        return new Promise((resolve, reject) => {
            const lineReader = rl.createInterface({
                input: this.inputStream
            })
            let lineIndex = 0
            lineReader.on('line', line => {
                this.parseLine(lineIndex, line)
                lineIndex++
            })
            lineReader.on('error', e => reject(e))
            lineReader.on('close', () => {
                debug('[ParserState: %s] close', this.parserState)
                this.emit('close')
                if (this.parserState !== ParserState.INIT) {
                    reject(new Error(`Unexpected End of File while parsing`))
                    return
                }
                resolve()
            })
        })
    }
}
