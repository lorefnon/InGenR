#!/usr/bin/env node

import { Command, flags } from '@oclif/command'
import { run } from '.'
// @ts-ignore
import handleError from '@oclif/errors/handle'

export class CLI extends Command {
  static flags = {
    version: flags.version(),
    help: flags.help(),
    input: flags.string({
      char: 'i'
    })
  }
  run = run
}

CLI.run().catch(handleError)
