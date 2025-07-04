import type { ArgumentsCamelCase, Argv } from 'yargs'
import { logger } from '../logger'
import { blue, green, red } from 'picocolors'
import { clientNames, readConfig, writeConfig } from '../client-config'

export interface InstallArgv {
  target?: string
  name?: string
  client: string
  local?: boolean
  yes?: boolean
}

export const command = '$0 [target]'
export const describe = 'Install MCP server'

export function builder(yargs: Argv<InstallArgv>): Argv {
  return yargs
    .positional('target', {
      type: 'string',
      description: 'Package name, full command, or URL to install',
    })
    .option('name', {
      type: 'string',
      description: 'Name of the server (auto-extracted from target if not provided)',
    })
    .option('client', {
      type: 'string',
      description: 'Client to use for installation',
      demandOption: true,
    })
    .option('local', {
      type: 'boolean',
      description: 'Install to the local directory instead of the default location',
      default: false,
    })
    .option('yes', {
      type: 'boolean',
      alias: 'y',
      description: 'Skip confirmation prompt',
      default: false,
    })
}

function isUrl(input: string): boolean {
  return input.startsWith('http://') || input.startsWith('https://')
}

function isCommand(input: string): boolean {
  return input.includes(' ') || input.startsWith('npx ') || input.startsWith('node ')
}

function inferNameFromInput(input: string): string {
  if (isUrl(input)) {
    // For URLs like https://example.com/path -> example-com
    try {
      const url = new URL(input)
      return url.hostname.replace(/\./g, '-')
    } catch {
      // Fallback for malformed URLs
      const parts = input.split('/')
      return parts[parts.length - 1] || 'server'
    }
  } else if (isCommand(input)) {
    // For commands, extract package name
    const parts = input.split(' ')
    if (parts[0] === 'npx' && parts.length > 1) {
      // Skip flags like -y and get the package name
      const packageIndex = parts.findIndex((part, index) => index > 0 && !part.startsWith('-'))
      if (packageIndex !== -1) {
        return parts[packageIndex]!
      }
    }
    return parts[0]!
  } else {
    // Simple package name like "mcp-server" or "@org/mcp-server"
    return input
  }
}

function buildCommand(input: string): string {
  if (isUrl(input)) {
    return input // URLs are handled separately
  } else if (isCommand(input)) {
    return input // Already a full command
  } else {
    // Simple package name, convert to npx command
    return `npx ${input}`
  }
}

export async function handler(argv: ArgumentsCamelCase<InstallArgv>) {
  if (!argv.client || !clientNames.includes(argv.client)) {
    logger.error(`Invalid client: ${argv.client}. Available clients: ${clientNames.join(', ')}`)
    return
  }

  let target = argv.target
  if (!target) {
    target = (await logger.prompt('Enter the package name, command, or URL:', {
      type: 'text',
    })) as string
  }

  const name = argv.name || inferNameFromInput(target)
  const command = buildCommand(target)

  if (argv.client === 'warp') {
    logger.log('')
    logger.info('Warp requires a manual installation through their UI.')
    logger.log('  Please copy the following configuration object and add it to your Warp MCP config:\n')
    logger.log(
      JSON.stringify(
        {
          [name]: {
            command: isUrl(target) ? 'npx' : command.split(' ')[0],
            args: isUrl(target) ? ['-y', 'supergateway', '--sse', target] : command.split(' ').slice(1),
            env: {},
            working_directory: null,
            start_on_launch: true,
          },
        },
        null,
        2,
      )
        .split('\n')
        .map((line) => green('  ' + line))
        .join('\n'),
    )
    logger.box("Read Warp's documentation at", blue('https://docs.warp.dev/knowledge-and-collaboration/mcp'))
    return
  }

  logger.info(`Installing MCP server "${name}" for ${argv.client}${argv.local ? ' (locally)' : ''}`)

  let ready = argv.yes
  if (!ready) {
    ready = await logger.prompt(green(`Install MCP server "${name}" in ${argv.client}?`), {
      type: 'confirm',
    })
  }

  if (ready) {
    try {
      const config = readConfig(argv.client, argv.local)

      if (isUrl(target)) {
        // URL-based installation
        if (argv.client === 'cursor' || argv.client === 'claude') {
          config.mcpServers[name] = {
            url: target,
          }
        } else {
          config.mcpServers[name] = {
            command: 'npx',
            args: ['-y', 'supergateway', '--sse', target],
          }
        }
      } else {
        // Command-based installation (including simple package names)
        const cmdParts = command.split(' ')
        config.mcpServers[name] = {
          command: cmdParts[0],
          args: cmdParts.slice(1),
        }
      }

      writeConfig(config, argv.client, argv.local)
      logger.box(
        green(`Successfully installed MCP server "${name}" in ${argv.client}${argv.local ? ' (locally)' : ''}`),
      )
    } catch (e) {
      logger.error(red((e as Error).message))
    }
  }
}
