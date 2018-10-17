import { GeneratorLocator, Generator } from "./GeneratorLocator"
import _debug from "debug"

const debug = _debug("InGenR:GeneratorLocator")

export class MockLocator extends GeneratorLocator {
  public mockGenerators = new Map<string, Generator | { default: Generator }>()
  public generatorDir = "<project-root>/ingenr-generators"
  // tslint:disable-next-line:no-empty
  async bootstrap() {}
  protected requireModule(requirable: string) {
    debug("Attempting to require mocked module", requirable)
    const retrieved: any = this.mockGenerators.get(requirable)
    if (retrieved) {
      return retrieved.default || retrieved
    }
    return retrieved
  }
}
