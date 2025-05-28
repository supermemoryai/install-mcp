// biome-ignore lint/style/useImportType: <explanation>
import yargs, { ArgumentsCamelCase, Argv } from 'yargs'
import { config } from 'dotenv'
import { builder, handler, type InstallArgv } from '../src/commands/install'

config()

const run = yargs(process.argv.slice(2)).command({
  command: '$0 [target]',
  describe: 'Install MCP server',
  builder: (yargs) => builder(yargs as unknown as Argv<InstallArgv>),
  handler: (argv) => handler(argv as ArgumentsCamelCase<InstallArgv>),
})

run.help().argv
