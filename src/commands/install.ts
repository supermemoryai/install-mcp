import type { ArgumentsCamelCase, Argv } from 'yargs'
import { logger } from '../logger'
import { blue, green, red } from 'picocolors'
import {
  clientNames,
  readConfig,
  writeConfig,
  getConfigPath,
  getNestedValue,
  setNestedValue,
  type ClientConfig,
} from '../client-config'
import { detectMcpTransport } from '../detect-transport'

// Helper to set a server config in a nested structure
function setServerConfig(
  config: ClientConfig,
  configKey: string,
  serverName: string,
  serverConfig: ClientConfig,
): void {
  // Get or create the nested config object
  let servers = getNestedValue(config, configKey)
  if (!servers) {
    setNestedValue(config, configKey, {})
    servers = getNestedValue(config, configKey)
  }

  // Set the server config
  if (servers) {
    servers[serverName] = serverConfig
  }
}

export interface InstallArgv {
  target?: string
  name?: string
  client: string
  local?: boolean
  yes?: boolean
  header?: string[]
  transport?: 'sse' | 'http'
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
    .option('header', {
      type: 'array',
      description: 'Headers to pass to the server (format: "Header: value")',
      default: [],
    })
    .option('transport', {
      type: 'string',
      alias: 't',
      description: 'Transport protocol for URL servers (sse or http)',
      choices: ['sse', 'http'],
    } as const)
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

function parseHeaders(headers: string[]): Record<string, string> {
  const parsedHeaders: Record<string, string> = {}
  for (const header of headers) {
    const colonIndex = header.indexOf(':')
    if (colonIndex !== -1) {
      const name = header.substring(0, colonIndex).trim()
      const value = header.substring(colonIndex + 1).trim()
      if (name && value) {
        parsedHeaders[name] = value
      }
    }
  }
  return parsedHeaders
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

  // Prompt for transport if target is a URL and transport not specified
  let transport = argv.transport
  if (isUrl(target) && !transport) {
    // Try to auto-detect the transport type
    logger.info('Detecting transport type... this may take a few seconds.')

    const detectedTransport = await detectMcpTransport(target, {
      timeoutMs: 5000,
      headers: argv.header ? parseHeaders(argv.header) : undefined,
    })

    if (detectedTransport === 'http' || detectedTransport === 'sse') {
      // We detected a transport type, ask for confirmation
      const transportDisplay = detectedTransport === 'http' ? 'streamable HTTP' : 'SSE'
      const confirmed = await logger.prompt(
        `We've detected that this server uses the ${transportDisplay} transport method. Is this correct?`,
        { type: 'confirm' },
      )

      if (confirmed) {
        transport = detectedTransport
      } else {
        // User said no, use the other transport method
        transport = detectedTransport === 'http' ? 'sse' : 'http'
        const otherTransportDisplay = transport === 'http' ? 'streamable HTTP' : 'SSE'
        logger.info(`Installing as ${otherTransportDisplay} transport method.`)
      }
    } else {
      // Detection failed, fall back to manual questions
      logger.info('Could not auto-detect transport type, please answer the following questions:')

      // Ask about streamable HTTP first (default yes)
      const supportsStreamableHttp = await logger.prompt(
        'Does this server support the streamable HTTP transport method?',
        { type: 'confirm' },
      )

      if (supportsStreamableHttp) {
        transport = 'http'
      } else {
        // Ask about legacy SSE (default no, but if they said no to HTTP, we need to confirm SSE)
        const usesLegacySSE = await logger.prompt('Does your server use the legacy SSE transport method?', {
          type: 'confirm',
        })

        if (usesLegacySSE) {
          transport = 'sse'
        } else {
          logger.error('Remote servers must support either streamable HTTP or legacy SSE transport method.')
          return
        }
      }
    }
  }

  const name = argv.name || inferNameFromInput(target)
  const command = buildCommand(target)

  if (argv.client === 'warp') {
    logger.log('')
    logger.info('Warp requires a manual installation through their UI.')
    logger.log('  Please copy the following configuration object and add it to your Warp MCP config:\n')

    // Build args array for Warp
    let warpArgs: string[]
    if (isUrl(target)) {
      const transportFlag = transport === 'http' ? '--streamableHttp' : '--sse'
      warpArgs = ['-y', 'supergateway', transportFlag, target]
      // Add headers as arguments for supergateway
      if (argv.header && argv.header.length > 0) {
        for (const header of argv.header) {
          warpArgs.push('--header', header)
        }
      }
    } else {
      warpArgs = command.split(' ').slice(1)
    }

    logger.log(
      JSON.stringify(
        {
          [name]: {
            command: isUrl(target) ? 'npx' : command.split(' ')[0],
            args: warpArgs,
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
      const configPath = getConfigPath(argv.client, argv.local)
      const configKey = configPath.configKey

      if (isUrl(target)) {
        // URL-based installation
        if (['cursor', 'vscode'].includes(argv.client)) {
          const serverConfig: ClientConfig = {
            url: target,
          }
          // Add headers if provided
          if (argv.header && argv.header.length > 0) {
            const parsedHeaders = parseHeaders(argv.header)
            if (Object.keys(parsedHeaders).length > 0) {
              serverConfig.headers = parsedHeaders
            }
          }
          setServerConfig(config, configKey, name, serverConfig)
        } else {
          const transportFlag = transport === 'http' ? '--streamableHttp' : '--sse'
          const args = ['-y', 'supergateway', transportFlag, target]
          // Add headers as arguments for supergateway
          if (argv.header && argv.header.length > 0) {
            for (const header of argv.header) {
              args.push('--header', header)
            }
          }
          setServerConfig(config, configKey, name, {
            command: 'npx',
            args: args,
          })
        }
      } else {
        // Command-based installation (including simple package names)
        const cmdParts = command.split(' ')
        setServerConfig(config, configKey, name, {
          command: cmdParts[0],
          args: cmdParts.slice(1),
        })
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
