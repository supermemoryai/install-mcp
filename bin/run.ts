// biome-ignore lint/style/useImportType: <explanation>
import yargs, { CommandModule } from 'yargs'
import { config } from 'dotenv'
import { commands } from '../src'

config()

const run = yargs(process.argv.slice(2))
for (const command of commands) {
  run.command(command as unknown as CommandModule)
}

run.demandCommand(1, 'You need at least one command before moving on').help().argv
