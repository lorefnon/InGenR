import * as fs from 'fs';
import * as log from "fancy-log";
import _debug from "debug";
import { file as getTmpFile } from "tmp";
import { GeneratorLocator } from "./GeneratorLocator";
import { CommentParser, ParsedBlock } from './CommentParser';
import { TopLevelOptions } from '.';
import { WriteStream } from 'tty';

const debug = _debug("InGenR:TemplateProcessor");

interface TmpFileHandle {
    filePath: string;
    fd: number;
    clean(): void;
}

const getTmpFileAsync = () => new Promise<TmpFileHandle>((resolve, reject) => {
    getTmpFile({ keep: true }, (err, filePath, fd, clean) => {
        if (err) {
            reject(err);
        } else {
            resolve({ filePath, fd, clean });
        }
    })
})

export class TemplateProcessor {
    private readStream?: fs.ReadStream;
    private didChange?: boolean;
    private writeStream?: fs.WriteStream;
    private tmpFile?: TmpFileHandle;
    private commentParser?: CommentParser;

    constructor(
        private filePath: string,
        private locator: GeneratorLocator,
        private options: TopLevelOptions
    ) { }

    async process() {
        this.readStream = fs.createReadStream(this.filePath, { encoding: 'utf8' });
        this.tmpFile = await getTmpFileAsync();
        this.didChange = false;
        this.writeStream = fs.createWriteStream(this.filePath);
        this.commentParser = new CommentParser(
            this.readStream,
            this.options.parser
        );
        const promise = this.commentParser.parse();
        try {
            await this.processComments();
            await promise;
        } catch (e) {
            log.error(`Failed to process file: ${this.filePath}`);
            this.tmpFile.clean();
            throw e;
        }
    }

    private async processComments() {
        return new Promise((resolve, reject) => {
            let promise = Promise.resolve();
            this.commentParser!.on('item', async (item) => {
                promise = promise.then(() => this.processItem(item)).catch(reject)
            });
            this.commentParser!.on('close', () => {
                promise.then(() => resolve(true));
            })
        });
    }

    private async processItem({ type, data }: any) {
        if (type === 'LINE') {
            this.writeStream!.write(`${data}\n`);
            return;
        }
        if (type === 'PARSED_BLOCK') {
            await this.processParsedBlock(data);
        }
    }

    private async processParsedBlock(block: ParsedBlock) {
        const generate = await this.locator.locate(block.templateName);
        const generatedContent = (await generate(block)).replace(/\r\n/gm, "\n");
        debug('Generated Content:', generatedContent);
        let prevGeneratedContent;
        if (block.currentContent) {
            prevGeneratedContent = block.currentContent.join('\n');
            debug('Previous content:', prevGeneratedContent);
        }
        if (generatedContent === prevGeneratedContent) {
            this.writeStream!.write(prevGeneratedContent);
        } else {
            debug("Encountered change");
            this.didChange = true;
            this.writeStream!.write(generatedContent);
        }
    }
}
