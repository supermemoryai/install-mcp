// biome-ignore lint/style/useImportType: <explanation>
import yargs, { ArgumentsCamelCase, Argv, CommandModule } from 'yargs'
import { config } from 'dotenv'
import { commands } from '../src'
import { builder, handler, type InstallArgv } from '../src/commands/install'

config()

const run = yargs(process.argv.slice(2))
  .command({
    command: '$0',
    describe: 'MCP Server Installation CLI',
    builder: (yargs) => builder(yargs as unknown as Argv<InstallArgv>),
    handler: (argv) => handler(argv as ArgumentsCamelCase<InstallArgv>),
  })

for (const command of commands) {
  run.command(command as unknown as CommandModule)
}

run.demandCommand(1, 'You need at least one command before moving on').help().argv
