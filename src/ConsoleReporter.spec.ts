import { ConsoleReporter } from "./ConsoleReporter";

describe("ConsoleReporter", () => {
    it('works as expected', () => {
        const reporter = new ConsoleReporter({
            enableColor: false
        });
        const messages: any[] = []
        reporter.console = ['log', 'debug', 'info', 'warn', 'error'].reduce((result: any, type: string) => {
            result[type] = (...args: any[]) => {
                messages.push({type, args})
            }
            return result
        }, {}) as any;
        reporter.bufferWarning("/tmp/foo.js", 10, "lorem ipsum dolor sit amet", [
            {message: "something failed" },
            {index: 10, message: "something else failed"}
        ])
        reporter.bufferWarning("/tmp/bar.js", undefined, undefined, [{
            message: "something failed",
            error: new Error("Something Failed")
        }])
        expect(messages).toHaveLength(0)
        reporter.reportAllWarnings();
        expect(messages).toMatchSnapshot();
    })
})
