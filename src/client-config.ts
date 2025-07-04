import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { verbose } from './logger'
// import { execFileSync } from "node:child_process"

export interface ClientConfig {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any
}

interface ClientFileTarget {
  type: 'file'
  path: string
  localPath?: string
}
type ClientInstallTarget = ClientFileTarget

// Initialize platform-specific paths
const homeDir = os.homedir()

const platformPaths = {
  win32: {
    baseDir: process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming'),
    vscodePath: path.join('Code', 'User', 'globalStorage'),
  },
  darwin: {
    baseDir: path.join(homeDir, 'Library', 'Application Support'),
    vscodePath: path.join('Code', 'User', 'globalStorage'),
  },
  linux: {
    baseDir: process.env.XDG_CONFIG_HOME || path.join(homeDir, '.config'),
    vscodePath: path.join('Code/User/globalStorage'),
  },
}

const platform = process.platform as keyof typeof platformPaths
const { baseDir, vscodePath } = platformPaths[platform]
const defaultClaudePath = path.join(baseDir, 'Claude', 'claude_desktop_config.json')

// Define client paths using the platform-specific base directories
const clientPaths: { [key: string]: ClientInstallTarget } = {
  claude: { type: 'file', path: defaultClaudePath },
  cline: {
    type: 'file',
    path: path.join(baseDir, vscodePath, 'saoudrizwan.claude-dev', 'settings', 'cline_mcp_settings.json'),
  },
  'roo-cline': {
    type: 'file',
    path: path.join(baseDir, vscodePath, 'rooveterinaryinc.roo-cline', 'settings', 'mcp_settings.json'),
  },
  windsurf: {
    type: 'file',
    path: path.join(homeDir, '.codeium', 'windsurf', 'mcp_config.json'),
  },
  witsy: { type: 'file', path: path.join(baseDir, 'Witsy', 'settings.json') },
  enconvo: {
    type: 'file',
    path: path.join(homeDir, '.config', 'enconvo', 'mcp_config.json'),
  },
  cursor: {
    type: 'file',
    path: path.join(homeDir, '.cursor', 'mcp.json'),
    localPath: path.join(process.cwd(), '.cursor', 'mcp.json'),
  },
  warp: {
    type: 'file',
    path: 'no-local-config', // it's okay this isn't a real path, we never use it
  },
  'gemini-cli': {
    type: 'file',
    path: path.join(homeDir, '.gemini', 'settings.json'),
    localPath: path.join(process.cwd(), '.gemini', 'settings.json'),
  },
}

export const clientNames = Object.keys(clientPaths)

export function getConfigPath(client?: string, local?: boolean): ClientInstallTarget {
  const normalizedClient = client?.toLowerCase() || 'claude'
  verbose(`Getting config path for client: ${normalizedClient}${local ? ' (local)' : ''}`)

  const configTarget = clientPaths[normalizedClient]
  if (!configTarget) {
    return {
      type: 'file',
      path: path.join(path.dirname(defaultClaudePath), '..', client || 'claude', `${normalizedClient}_config.json`),
    }
  }

  if (local && configTarget.localPath) {
    verbose(`Using local config path for ${normalizedClient}: ${configTarget.localPath}`)
    return { ...configTarget, path: configTarget.localPath }
  }

  verbose(`Using default config path for ${normalizedClient}: ${configTarget.path}`)
  return configTarget
}

export function readConfig(client: string, local?: boolean): ClientConfig {
  verbose(`Reading config for client: ${client}${local ? ' (local)' : ''}`)
  try {
    const configPath = getConfigPath(client, local)

    verbose(`Checking if config file exists at: ${configPath.path}`)
    if (!fs.existsSync(configPath.path)) {
      verbose('Config file not found, returning default empty config')
      return { mcpServers: {} }
    }

    verbose('Reading config file content')
    const rawConfig = JSON.parse(fs.readFileSync(configPath.path, 'utf8'))
    verbose(`Config loaded successfully: ${JSON.stringify(rawConfig, null, 2)}`)

    return {
      ...rawConfig,
      mcpServers: rawConfig.mcpServers || {},
    }
  } catch (error) {
    verbose(`Error reading config: ${error instanceof Error ? error.stack : JSON.stringify(error)}`)
    return { mcpServers: {} }
  }
}

export function writeConfig(config: ClientConfig, client?: string, local?: boolean): void {
  verbose(`Writing config for client: ${client || 'default'}${local ? ' (local)' : ''}`)
  verbose(`Config data: ${JSON.stringify(config, null, 2)}`)

  if (!config.mcpServers || typeof config.mcpServers !== 'object') {
    verbose('Invalid mcpServers structure in config')
    throw new Error('Invalid mcpServers structure')
  }

  const configPath = getConfigPath(client, local)

  writeConfigFile(config, configPath)
}

function writeConfigFile(config: ClientConfig, target: ClientFileTarget): void {
  const configDir = path.dirname(target.path)

  verbose(`Ensuring config directory exists: ${configDir}`)
  if (!fs.existsSync(configDir)) {
    verbose(`Creating directory: ${configDir}`)
    fs.mkdirSync(configDir, { recursive: true })
  }

  let existingConfig: ClientConfig = { mcpServers: {} }
  try {
    if (fs.existsSync(target.path)) {
      verbose('Reading existing config file for merging')
      existingConfig = JSON.parse(fs.readFileSync(target.path, 'utf8'))
      verbose(`Existing config loaded: ${JSON.stringify(existingConfig, null, 2)}`)
    }
  } catch (error) {
    verbose(`Error reading existing config for merge: ${error instanceof Error ? error.message : String(error)}`)
    // If reading fails, continue with empty existing config
  }

  verbose('Merging configs')
  const mergedConfig = {
    ...existingConfig,
    ...config,
  }
  verbose(`Merged config: ${JSON.stringify(mergedConfig, null, 2)}`)

  verbose(`Writing config to file: ${target.path}`)
  fs.writeFileSync(target.path, JSON.stringify(mergedConfig, null, 2))
  verbose('Config successfully written')
}
