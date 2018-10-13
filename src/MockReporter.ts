import { Reporter, ConsoleReporter } from "./ConsoleReporter"

export class MockReporter extends ConsoleReporter {
  // tslint:disable-next-line:no-empty
  reportAllWarnings() {}
}
