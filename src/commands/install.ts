import type { ArgumentsCamelCase, Argv } from 'yargs'
import { logger } from '../logger'
import { green, red } from 'picocolors'
import { clientNames, readConfig, writeConfig } from '../client-config'

export interface InstallArgv {
  target?: string
  name?: string
  client: string
}

export const command = 'install [target]'
export const describe = 'Install MCP server'
export const aliases = ['i']

export function builder(yargs: Argv<InstallArgv>): Argv {
  return yargs
    .positional('target', {
      type: 'string',
      description: 'Installation target (URL or command)',
    })
    .positional('name', {
      type: 'string',
      description: 'Name of the server',
    })
    .option('client', {
      type: 'string',
      description: 'Client to use for installation',
      demandOption: true,
    })
}

export async function handler(argv: ArgumentsCamelCase<InstallArgv>) {
  if (!argv.client || !clientNames.includes(argv.client)) {
    logger.error(`Invalid client: ${argv.client}. Available clients: ${clientNames.join(', ')}`)
    return
  }

  let target = argv.target
  if (!target) {
    target = (await logger.prompt('Enter the installation target (URL or command):', {
      type: 'text',
    })) as string
  }

  let name = argv.name
  if (!name) {
    name = (await logger.prompt('Enter the name of the server:', {
      type: 'text',
    })) as string
  }

  const ready = await logger.prompt(green(`Are you ready to install MCP server ${target} in ${argv.client}?`), {
    type: 'confirm',
  })
  if (ready) {
    try {
      const config = readConfig(argv.client)

      // if it is a URL, add it to config
      if (target.startsWith('http') || target.startsWith('https')) {
        config.mcpServers[name] = {
          command: 'npx',
          args: ['-y', 'supergateway', '--sse', target],
        }
        writeConfig(config, argv.client)
      }

      // if it is a command, add it to config
      else {
        config.mcpServers[name] = {
          command: target.split(' ')[0],
          args: target.split(' ').slice(1),
        }
        writeConfig(config, argv.client)
      }

      logger.box(green(`Successfully installed MCP server ${target} in ${argv.client}.`))
    } catch (e) {
      logger.error(red((e as Error).message))
    }
  }
}
