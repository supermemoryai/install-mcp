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
import { spawn } from 'child_process'

// Helper to set a server config in a nested structure
function setServerConfig(
  config: ClientConfig,
  configKey: string,
  serverName: string,
  serverConfig: ClientConfig,
  client: string,
): void {
  // Get or create the nested config object
  let servers = getNestedValue(config, configKey)
  if (!servers) {
    setNestedValue(config, configKey, {})
    servers = getNestedValue(config, configKey)
  }

  // Set the server config
  if (servers) {
    if (client === 'goose') {
      // Goose has a different config structure and uses 'envs' instead of 'env'
      const { env, command, args, ...rest } = serverConfig
      servers[serverName] = {
        name: serverName,
        cmd: command,
        args: args,
        enabled: true,
        envs: env || {},
        type: 'stdio',
        timeout: 300,
        ...rest, // Allow overriding other defaults
      }
    } else if (client === 'zed') {
      // Zed has a different config structure
      servers[serverName] = {
        source: 'custom',
        command: serverConfig.command,
        args: serverConfig.args,
        env: serverConfig.env || {},
        ...serverConfig, // Allow overriding defaults
      }
    } else {
      servers[serverName] = serverConfig
    }
  }
}

export interface InstallArgv {
  target?: string
  name?: string
  client: string
  local?: boolean
  yes?: boolean
  header?: string[]
  oauth?: 'yes' | 'no'
  project?: string
  env?: string[]
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
    .option('project', { type: 'string', description: 'Project for https://api.supermemory.ai/*' })
    .option('oauth', {
      type: 'string',
      description: 'Whether the server uses OAuth authentication (yes/no). If not specified, you will be prompted.',
      choices: ['yes', 'no'],
    } as const)
    .option('env', {
      type: 'array',
      description: 'Environment variables to pass to the server (format: --env key value)',
      default: [],
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

function isSupermemoryUrl(input: string): boolean {
  try {
    const url = new URL(input)
    return url.hostname === 'api.supermemory.ai'
  } catch {
    return false
  }
}

// Parse environment variables from array format into key-value object
function parseEnvVars(envArray?: string[]): { [key: string]: string } | undefined {
  if (!envArray || envArray.length === 0) {
    return undefined
  }

  const envObj: { [key: string]: string } = {}
  for (let i = 0; i < envArray.length; i += 2) {
    const key = envArray[i]
    const value = envArray[i + 1]
    if (key && value !== undefined) {
      envObj[key] = value
    }
  }

  return Object.keys(envObj).length > 0 ? envObj : undefined
}

// Run the authentication flow for remote servers before installation.
async function runAuthentication(url: string): Promise<void> {
  logger.info(`Running authentication for ${url}`)
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['-y', '-p', 'mcp-remote@latest', 'mcp-remote-client', url], {
      stdio: ['ignore', 'ignore', 'ignore'], // Hide all output
    })

    child.on('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`Authentication exited with code ${code}`))
      }
    })

    child.on('error', reject)
  })
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
  const envVars = parseEnvVars(argv.env)

  // Resolve Supermemory project header when installing its URL
  let projectHeader: string | undefined
  if (isUrl(target) && isSupermemoryUrl(target)) {
    let project = typeof argv.project === 'string' ? argv.project : undefined
    if (!project || project.trim() === '') {
      const input = (await logger.prompt(
        'Enter your Supermemory project (no spaces). Press Enter for "default" (you can override per LLM session).',
        { type: 'text' },
      )) as string
      project = (input || '').trim() || 'default'
    }
    if (/\s/.test(project)) {
      logger.error('Project must not contain spaces. Use hyphens or underscores instead.')
      return
    }
    projectHeader = `x-sm-project:${project}`
  }

  if (argv.client === 'warp') {
    logger.log('')
    logger.info('Warp requires a manual installation through their UI.')
    logger.log('  Please copy the following configuration object and add it to your Warp MCP config:\n')

    // Build args array for Warp
    let warpArgs: string[]
    if (isUrl(target)) {
      warpArgs = ['-y', 'mcp-remote@latest', target]
      // Add headers as arguments for supergateway
      if (argv.header && argv.header.length > 0) {
        for (const header of argv.header) {
          warpArgs.push('--header', header)
        }
      }
      if (projectHeader) {
        warpArgs.push('--header', projectHeader)
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
            env: envVars || {},
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
    if (isUrl(target)) {
      // Determine if we should use OAuth
      let usesOAuth: boolean
      if (argv.oauth === 'yes') {
        usesOAuth = true
      } else if (argv.oauth === 'no') {
        usesOAuth = false
      } else {
        // Ask if the server uses OAuth
        usesOAuth = await logger.prompt('Does this server use OAuth authentication?', {
          type: 'confirm',
        })
      }

      if (usesOAuth) {
        try {
          await runAuthentication(target)
        } catch {
          logger.error('Authentication failed. Use the client to authenticate.')
          return
        }
      }
    }

    try {
      const config = readConfig(argv.client, argv.local)
      const configPath = getConfigPath(argv.client, argv.local)
      const configKey = configPath.configKey

      if (isUrl(target)) {
        // URL-based installation

        const args = ['-y', 'mcp-remote@latest', target]
        // Add headers as arguments for supergateway
        if (argv.header && argv.header.length > 0) {
          for (const header of argv.header) {
            args.push('--header', header)
          }
        }
        if (projectHeader) {
          args.push('--header', projectHeader)
        }
        const serverConfig: ClientConfig = {
          command: 'npx',
          args: args,
        }
        if (envVars) {
          serverConfig.env = envVars
        }
        setServerConfig(config, configKey, name, serverConfig, argv.client)
      } else {
        // Command-based installation (including simple package names)
        const cmdParts = command.split(' ')
        const serverConfig: ClientConfig = {
          command: cmdParts[0],
          args: cmdParts.slice(1),
        }
        if (envVars) {
          serverConfig.env = envVars
        }
        setServerConfig(config, configKey, name, serverConfig, argv.client)
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
