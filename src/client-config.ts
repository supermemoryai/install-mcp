import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import yaml from 'js-yaml'

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
  configKey: string
  format?: 'json' | 'yaml' // Add format property for different file types
}
type ClientInstallTarget = ClientFileTarget

// Initialize platform-specific paths
function getPlatformPaths() {
  const homeDir = os.homedir()
  return {
    win32: {
      baseDir: process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming'),
      vscodePath: path.join('Code', 'User'),
    },
    darwin: {
      baseDir: path.join(homeDir, 'Library', 'Application Support'),
      vscodePath: path.join('Code', 'User'),
    },
    linux: {
      baseDir: process.env.XDG_CONFIG_HOME || path.join(homeDir, '.config'),
      vscodePath: path.join('Code/User'),
    },
  }
}

function getBasePaths() {
  const platformPaths = getPlatformPaths()
  const platform = process.platform as keyof typeof platformPaths
  const { baseDir, vscodePath } = platformPaths[platform]
  const defaultClaudePath = path.join(baseDir, 'Claude', 'claude_desktop_config.json')
  return { baseDir, vscodePath, defaultClaudePath }
}

// Define client paths using the platform-specific base directories
function getClientPaths(): { [key: string]: ClientInstallTarget } {
  const { baseDir, vscodePath, defaultClaudePath } = getBasePaths()
  const homeDir = os.homedir()

  return {
    claude: { type: 'file', path: defaultClaudePath, configKey: 'mcpServers' },
    cline: {
      type: 'file',
      path: path.join(
        baseDir,
        vscodePath,
        'globalStorage',
        'saoudrizwan.claude-dev',
        'settings',
        'cline_mcp_settings.json',
      ),
      configKey: 'mcpServers',
    },
    'roo-cline': {
      type: 'file',
      path: path.join(
        baseDir,
        vscodePath,
        'globalStorage',
        'rooveterinaryinc.roo-cline',
        'settings',
        'mcp_settings.json',
      ),
      configKey: 'mcpServers',
    },
    windsurf: {
      type: 'file',
      path: path.join(homeDir, '.codeium', 'windsurf', 'mcp_config.json'),
      configKey: 'mcpServers',
    },
    witsy: { type: 'file', path: path.join(baseDir, 'Witsy', 'settings.json'), configKey: 'mcpServers' },
    enconvo: {
      type: 'file',
      path: path.join(homeDir, '.config', 'enconvo', 'mcp_config.json'),
      configKey: 'mcpServers',
    },
    cursor: {
      type: 'file',
      path: path.join(homeDir, '.cursor', 'mcp.json'),
      localPath: path.join(process.cwd(), '.cursor', 'mcp.json'),
      configKey: 'mcpServers',
    },
    warp: {
      type: 'file',
      path: 'no-local-config', // it's okay this isn't a real path, we never use it
      configKey: 'mcpServers',
    },
    'gemini-cli': {
      type: 'file',
      path: path.join(homeDir, '.gemini', 'settings.json'),
      localPath: path.join(process.cwd(), '.gemini', 'settings.json'),
      configKey: 'mcpServers',
    },
    vscode: {
      type: 'file',
      path: path.join(baseDir, vscodePath, 'settings.json'),
      localPath: path.join(process.cwd(), '.vscode', 'settings.json'),
      configKey: 'mcp.servers',
    },
    'claude-code': {
      type: 'file',
      path: path.join(homeDir, '.claude.json'),
      localPath: path.join(process.cwd(), '.mcp.json'),
      configKey: 'mcpServers',
    },
    goose: {
      type: 'file',
      path: path.join(homeDir, '.config', 'goose', 'config.yaml'),
      configKey: 'extensions',
      format: 'yaml',
    },
  }
}

export const clientNames = [
  'claude',
  'cline',
  'roo-cline',
  'windsurf',
  'witsy',
  'enconvo',
  'cursor',
  'warp',
  'gemini-cli',
  'vscode',
  'claude-code',
  'goose',
]

// Helper function to get nested value from an object using dot notation
export function getNestedValue(obj: ClientConfig, path: string): ClientConfig | undefined {
  const keys = path.split('.')
  let current: ClientConfig | undefined = obj
  for (const key of keys) {
    if (current && typeof current === 'object' && key in current) {
      current = current[key] as ClientConfig
    } else {
      return undefined
    }
  }
  return current
}

// Helper function to set nested value in an object using dot notation
export function setNestedValue(obj: ClientConfig, path: string, value: ClientConfig): void {
  const keys = path.split('.')
  const lastKey = keys.pop()!
  const target = keys.reduce((current, key) => {
    if (!current[key]) current[key] = {}
    return current[key]
  }, obj)
  target[lastKey] = value
}

export function getConfigPath(client?: string, local?: boolean): ClientInstallTarget {
  const normalizedClient = client?.toLowerCase() || 'claude'
  verbose(`Getting config path for client: ${normalizedClient}${local ? ' (local)' : ''}`)

  const clientPaths = getClientPaths()
  const configTarget = clientPaths[normalizedClient]
  if (!configTarget) {
    const { defaultClaudePath } = getBasePaths()
    return {
      type: 'file',
      path: path.join(path.dirname(defaultClaudePath), '..', client || 'claude', `${normalizedClient}_config.json`),
      configKey: 'mcpServers',
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
      const defaultConfig: ClientConfig = {}
      setNestedValue(defaultConfig, configPath.configKey, {})
      return defaultConfig
    }

    verbose('Reading config file content')
    const fileContent = fs.readFileSync(configPath.path, 'utf8')

    let rawConfig: ClientConfig
    if (configPath.format === 'yaml') {
      rawConfig = (yaml.load(fileContent) as ClientConfig) || {}
    } else {
      rawConfig = JSON.parse(fileContent)
    }

    verbose(`Config loaded successfully: ${JSON.stringify(rawConfig, null, 2)}`)

    // Ensure the nested structure exists
    const existingValue = getNestedValue(rawConfig, configPath.configKey)
    if (!existingValue) {
      setNestedValue(rawConfig, configPath.configKey, {})
    }

    return rawConfig
  } catch (error) {
    verbose(`Error reading config: ${error instanceof Error ? error.stack : JSON.stringify(error)}`)
    const configPath = getConfigPath(client, local)
    const defaultConfig: ClientConfig = {}
    setNestedValue(defaultConfig, configPath.configKey, {})
    return defaultConfig
  }
}

export function writeConfig(config: ClientConfig, client?: string, local?: boolean): void {
  verbose(`Writing config for client: ${client || 'default'}${local ? ' (local)' : ''}`)
  verbose(`Config data: ${JSON.stringify(config, null, 2)}`)

  const configPath = getConfigPath(client, local)

  const nestedValue = getNestedValue(config, configPath.configKey)
  if (!nestedValue || typeof nestedValue !== 'object') {
    verbose(`Invalid ${configPath.configKey} structure in config`)
    throw new Error(`Invalid ${configPath.configKey} structure`)
  }

  writeConfigFile(config, configPath)
}

// Helper function for deep merge
function deepMerge(target: ClientConfig, source: ClientConfig): ClientConfig {
  const result = { ...target }

  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] || {}, source[key] as ClientConfig)
    } else {
      result[key] = source[key]
    }
  }

  return result
}

function writeConfigFile(config: ClientConfig, target: ClientFileTarget): void {
  const configDir = path.dirname(target.path)

  verbose(`Ensuring config directory exists: ${configDir}`)
  if (!fs.existsSync(configDir)) {
    verbose(`Creating directory: ${configDir}`)
    fs.mkdirSync(configDir, { recursive: true })
  }

  let existingConfig: ClientConfig = {}
  setNestedValue(existingConfig, target.configKey, {})

  try {
    if (fs.existsSync(target.path)) {
      verbose('Reading existing config file for merging')
      const fileContent = fs.readFileSync(target.path, 'utf8')

      if (target.format === 'yaml') {
        existingConfig = (yaml.load(fileContent) as ClientConfig) || {}
      } else {
        existingConfig = JSON.parse(fileContent)
      }

      verbose(`Existing config loaded: ${JSON.stringify(existingConfig, null, 2)}`)
    }
  } catch (error) {
    verbose(`Error reading existing config for merge: ${error instanceof Error ? error.message : String(error)}`)
    // If reading fails, continue with empty existing config
  }

  verbose('Merging configs')
  const mergedConfig = deepMerge(existingConfig, config)
  verbose(`Merged config: ${JSON.stringify(mergedConfig, null, 2)}`)

  verbose(`Writing config to file: ${target.path}`)

  let configContent: string
  if (target.format === 'yaml') {
    configContent = yaml.dump(mergedConfig, {
      indent: 2,
      lineWidth: -1,
      noRefs: true,
    })
  } else {
    configContent = JSON.stringify(mergedConfig, null, 2)
  }

  fs.writeFileSync(target.path, configContent)
  console.log(target.path)
  verbose('Config successfully written')
}
