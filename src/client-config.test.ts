import fs from 'node:fs'
import os from 'node:os'
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals'
import {
  ClientConfig,
  clientNames,
  getNestedValue,
  setNestedValue,
  getConfigPath,
  readConfig,
  writeConfig,
} from './client-config'

// Mock fs module
jest.mock('node:fs')
const mockFs = fs as jest.Mocked<typeof fs>

// Mock os module
jest.mock('node:os')
const mockOs = os as jest.Mocked<typeof os>

// Mock process
const mockProcess = {
  platform: 'darwin',
  cwd: jest.fn(() => '/test/cwd'),
  env: { APPDATA: undefined, XDG_CONFIG_HOME: undefined },
}
Object.defineProperty(process, 'platform', { value: 'darwin' })
Object.defineProperty(process, 'cwd', { value: mockProcess.cwd })
Object.defineProperty(process, 'env', { value: mockProcess.env })

describe('client-config', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockOs.homedir.mockReturnValue('/home/user')
    mockProcess.cwd.mockReturnValue('/test/cwd')
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('clientNames', () => {
    it('should contain all supported clients', () => {
      expect(clientNames).toEqual(
        expect.arrayContaining([
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
          'zed',
        ]),
      )
    })

    it('should have at least 13 clients', () => {
      expect(clientNames.length).toBeGreaterThanOrEqual(13)
    })
  })

  describe('getNestedValue', () => {
    it('should get nested value from object', () => {
      const obj = {
        level1: {
          level2: {
            level3: 'value',
          },
        },
      }
      expect(getNestedValue(obj, 'level1.level2.level3')).toBe('value')
    })

    it('should return undefined for non-existent path', () => {
      const obj = { level1: { level2: 'value' } }
      expect(getNestedValue(obj, 'level1.level2.level3')).toBeUndefined()
    })

    it('should return undefined for empty object', () => {
      expect(getNestedValue({}, 'level1.level2')).toBeUndefined()
    })

    it('should handle single level path', () => {
      const obj = { key: 'value' }
      expect(getNestedValue(obj, 'key')).toBe('value')
    })
  })

  describe('setNestedValue', () => {
    it('should set nested value in object', () => {
      const obj: ClientConfig = {}

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setNestedValue(obj, 'level1.level2.level3', 'value' as any)
      expect(obj).toEqual({
        level1: {
          level2: {
            level3: 'value',
          },
        },
      })
    })

    it('should create intermediate objects', () => {
      const obj: ClientConfig = {}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setNestedValue(obj, 'a.b.c.d', 'test' as any)
      expect(obj).toEqual({
        a: {
          b: {
            c: {
              d: 'test',
            },
          },
        },
      })
    })

    it('should handle single level path', () => {
      const obj: ClientConfig = {}

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setNestedValue(obj, 'key', 'value' as any)
      expect(obj).toEqual({ key: 'value' })
    })

    it('should override existing values', () => {
      const obj: ClientConfig = { level1: { level2: 'old' } }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setNestedValue(obj, 'level1.level2', 'new' as any)
      expect(obj.level1.level2).toBe('new')
    })
  })

  describe('getConfigPath', () => {
    it('should return default claude config path', () => {
      const result = getConfigPath()
      expect(result).toEqual({
        type: 'file',
        path: '/home/user/Library/Application Support/Claude/claude_desktop_config.json',
        configKey: 'mcpServers',
      })
    })

    it('should return client-specific config path', () => {
      const result = getConfigPath('cline')
      expect(result.path).toContain('saoudrizwan.claude-dev')
      expect(result.configKey).toBe('mcpServers')
    })

    it('should return local config path when specified', () => {
      const result = getConfigPath('cursor', true)
      expect(result.path).toBe('/test/cwd/.cursor/mcp.json')
    })

    it('should handle unknown client', () => {
      const result = getConfigPath('unknown-client')
      expect(result.path).toContain('unknown-client')
      expect(result.configKey).toBe('mcpServers')
    })

    it('should handle vscode with nested config key', () => {
      const result = getConfigPath('vscode')
      expect(result.configKey).toBe('mcp.servers')
    })
  })

  describe('readConfig', () => {
    it('should read existing config file', () => {
      const mockConfig = { mcpServers: { server1: { command: 'test' } } }
      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockConfig))

      const result = readConfig('claude')
      expect(result).toEqual(mockConfig)
    })

    it('should return default config when file does not exist', () => {
      mockFs.existsSync.mockReturnValue(false)

      const result = readConfig('claude')
      expect(result).toEqual({ mcpServers: {} })
    })

    it('should handle JSON parse error', () => {
      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue('invalid json')

      const result = readConfig('claude')
      expect(result).toEqual({ mcpServers: {} })
    })

    it('should create nested structure if missing', () => {
      const mockConfig = { otherKey: 'value' }
      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockConfig))

      const result = readConfig('claude')
      expect(result).toEqual({ otherKey: 'value', mcpServers: {} })
    })

    it('should handle vscode nested config key', () => {
      mockFs.existsSync.mockReturnValue(false)

      const result = readConfig('vscode')
      expect(result).toEqual({ mcp: { servers: {} } })
    })
  })

  describe('writeConfig', () => {
    beforeEach(() => {
      mockFs.existsSync.mockReturnValue(true)
      mockFs.mkdirSync.mockImplementation(() => '')
      mockFs.writeFileSync.mockImplementation(() => {})
      mockFs.readFileSync.mockReturnValue('{}')
    })

    it('should write config to file', () => {
      const config = { mcpServers: { server1: { command: 'test' } } }
      writeConfig(config, 'claude')

      expect(mockFs.writeFileSync).toHaveBeenCalled()
      const writeCall = mockFs.writeFileSync.mock.calls[0]
      expect(writeCall![0]).toContain('claude_desktop_config.json')
      expect(JSON.parse(writeCall![1] as string)).toEqual(config)
    })

    it('should create directory if it does not exist', () => {
      mockFs.existsSync.mockReturnValueOnce(false).mockReturnValue(false)
      const config = { mcpServers: { server1: { command: 'test' } } }

      writeConfig(config, 'claude')

      expect(mockFs.mkdirSync).toHaveBeenCalled()
    })

    it('should merge with existing config', () => {
      const existingConfig = {
        mcpServers: { server1: { command: 'old' } },
        otherKey: 'value',
      }
      const newConfig = { mcpServers: { server2: { command: 'new' } } }
      mockFs.readFileSync.mockReturnValue(JSON.stringify(existingConfig))

      writeConfig(newConfig, 'claude')

      const writeCall = mockFs.writeFileSync.mock.calls[0]
      const writtenConfig = JSON.parse(writeCall![1] as string)
      expect(writtenConfig).toEqual({
        mcpServers: {
          server1: { command: 'old' },
          server2: { command: 'new' },
        },
        otherKey: 'value',
      })
    })

    it('should throw error for invalid config structure', () => {
      const config = { mcpServers: 'invalid' }
      expect(() => writeConfig(config, 'claude')).toThrow('Invalid mcpServers structure')
    })

    it('should handle file read error during merge', () => {
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('Read error')
      })
      const config = { mcpServers: { server1: { command: 'test' } } }

      writeConfig(config, 'claude')

      expect(mockFs.writeFileSync).toHaveBeenCalled()
    })
  })

  describe('platform-specific paths', () => {
    it('should handle Windows paths', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' })
      Object.defineProperty(process, 'env', {
        value: { APPDATA: 'C:\\Users\\Test\\AppData\\Roaming' },
      })

      const result = getConfigPath('claude')
      expect(result.path).toBe('C:\\Users\\Test\\AppData\\Roaming/Claude/claude_desktop_config.json')
    })

    it('should handle Linux paths', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' })
      Object.defineProperty(process, 'env', {
        value: { XDG_CONFIG_HOME: '/home/test/.config' },
      })

      const result = getConfigPath('claude')
      expect(result.path).toBe('/home/test/.config/Claude/claude_desktop_config.json')
    })

    it('should fallback to default Linux paths', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' })
      Object.defineProperty(process, 'env', { value: {} })

      const result = getConfigPath('claude')
      expect(result.path).toBe('/home/user/.config/Claude/claude_desktop_config.json')
    })
  })
})
