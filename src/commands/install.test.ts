import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals'
import type { ArgumentsCamelCase } from 'yargs'
import { handler, InstallArgv } from './install'
import * as clientConfig from '../client-config'
import { logger } from '../logger'
import { spawn } from 'child_process'
import type { ChildProcess } from 'child_process'
import { EventEmitter } from 'events'

// Mock dependencies
jest.mock('../client-config')
jest.mock('../logger')
jest.mock('child_process')

const mockClientConfig = clientConfig as jest.Mocked<typeof clientConfig>
const mockLogger = logger as jest.Mocked<typeof logger>
const mockSpawn = spawn as jest.MockedFunction<typeof spawn>

describe('install command', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    Object.defineProperty(mockClientConfig, 'clientNames', {
      value: ['claude', 'cline', 'cursor', 'vscode', 'warp'],
      writable: true,
    })
    mockClientConfig.readConfig.mockReturnValue({ mcpServers: {} })
    mockClientConfig.getNestedValue.mockImplementation((obj, path) => {
      if (path === 'mcpServers') return obj.mcpServers || {}
      if (path === 'mcp.servers') return obj.mcp?.servers || {}
      return undefined
    })
    mockClientConfig.setNestedValue.mockImplementation((obj, path, value) => {
      if (path === 'mcpServers') obj.mcpServers = value
      if (path === 'mcp.servers') {
        if (!obj.mcp) obj.mcp = {}
        obj.mcp.servers = value
      }
    })
    mockClientConfig.writeConfig.mockImplementation(() => {})
    mockClientConfig.getConfigPath.mockReturnValue({
      type: 'file',
      path: '/test/config.json',
      configKey: 'mcpServers',
    })
    mockLogger.prompt.mockResolvedValue('test-package')

    // Mock successful authentication by default
    const mockChildProcess = new EventEmitter() as unknown as ChildProcess
    // Create a properly typed mock for the 'on' method
    const mockOn = jest.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (event === 'close') {
        setTimeout(() => handler(0), 0)
      }
      return mockChildProcess
    })
    mockChildProcess.on = mockOn as ChildProcess['on']
    mockSpawn.mockReturnValue(mockChildProcess)
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('handler', () => {
    it('should error on invalid client', async () => {
      const argv: ArgumentsCamelCase<InstallArgv> = {
        client: 'invalid-client',
        target: 'test-package',
        _: [],
        $0: 'install-mcp',
      }

      await handler(argv)

      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Invalid client: invalid-client'))
    })

    it('should prompt for target if not provided', async () => {
      const argv: ArgumentsCamelCase<InstallArgv> = {
        client: 'claude',
        _: [],
        $0: 'install-mcp',
      }

      mockLogger.prompt.mockResolvedValueOnce('test-package').mockResolvedValueOnce(true)

      await handler(argv)

      expect(mockLogger.prompt).toHaveBeenCalledWith('Enter the package name, command, or URL:', { type: 'text' })
    })

    it('should install simple package name', async () => {
      const argv: ArgumentsCamelCase<InstallArgv> = {
        client: 'claude',
        target: 'test-package',
        yes: true,
        _: [],
        $0: 'install-mcp',
      }

      await handler(argv)

      expect(mockClientConfig.writeConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          mcpServers: {
            'test-package': {
              command: 'npx',
              args: ['test-package'],
            },
          },
        }),
        'claude',
        undefined,
      )
    })

    it('should install URL with mcp-remote for non-direct-URL clients', async () => {
      const argv: ArgumentsCamelCase<InstallArgv> = {
        client: 'cline',
        target: 'https://example.com/server',
        yes: true,
        _: [],
        $0: 'install-mcp',
      }

      await handler(argv)

      expect(mockLogger.info).toHaveBeenCalledWith('Running authentication for https://example.com/server')
      expect(mockSpawn).toHaveBeenCalledWith(
        'npx',
        ['-y', '-p', 'mcp-remote@latest', 'mcp-remote-client', 'https://example.com/server'],
        { stdio: ['ignore', 'ignore', 'ignore'] },
      )
      expect(mockClientConfig.writeConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          mcpServers: {
            'example-com': {
              command: 'npx',
              args: ['-y', 'mcp-remote@latest', 'https://example.com/server'],
            },
          },
        }),
        'cline',
        undefined,
      )
    })

    it('should handle authentication failure for URL installation', async () => {
      const argv: ArgumentsCamelCase<InstallArgv> = {
        client: 'cline',
        target: 'https://example.com/server',
        yes: true,
        _: [],
        $0: 'install-mcp',
      }

      // Mock authentication failure
      const mockChildProcess = new EventEmitter() as unknown as ChildProcess
      // Create a properly typed mock for the 'on' method
      const mockOn = jest.fn((event: string, handler: (...args: unknown[]) => void) => {
        if (event === 'close') {
          setTimeout(() => handler(1), 0) // Exit code 1 for failure
        }
        return mockChildProcess
      })
      mockChildProcess.on = mockOn as ChildProcess['on']
      mockSpawn.mockReturnValueOnce(mockChildProcess)

      await handler(argv)

      expect(mockLogger.error).toHaveBeenCalledWith('Authentication failed. Use the client to authenticate.')
      expect(mockClientConfig.writeConfig).not.toHaveBeenCalled()
    })

    it('should not run authentication for non-URL targets', async () => {
      const argv: ArgumentsCamelCase<InstallArgv> = {
        client: 'claude',
        target: 'test-package',
        yes: true,
        _: [],
        $0: 'install-mcp',
      }

      await handler(argv)

      // Should not have run authentication
      expect(mockSpawn).not.toHaveBeenCalled()
    })

    it('should install URL with mcp-remote for cursor/claude/vscode clients', async () => {
      const argv: ArgumentsCamelCase<InstallArgv> = {
        client: 'cursor',
        target: 'https://example.com/server',
        yes: true,
        _: [],
        $0: 'install-mcp',
      }

      await handler(argv)

      expect(mockLogger.info).toHaveBeenCalledWith('Running authentication for https://example.com/server')
      expect(mockSpawn).toHaveBeenCalledWith(
        'npx',
        ['-y', '-p', 'mcp-remote@latest', 'mcp-remote-client', 'https://example.com/server'],
        { stdio: ['ignore', 'ignore', 'ignore'] },
      )
      expect(mockClientConfig.writeConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          mcpServers: {
            'example-com': {
              command: 'npx',
              args: ['-y', 'mcp-remote@latest', 'https://example.com/server'],
            },
          },
        }),
        'cursor',
        undefined,
      )
    })

    it('should install full command', async () => {
      const argv: ArgumentsCamelCase<InstallArgv> = {
        client: 'claude',
        target: 'node server.js --port 3000',
        yes: true,
        _: [],
        $0: 'install-mcp',
      }

      await handler(argv)

      expect(mockClientConfig.writeConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          mcpServers: {
            node: {
              command: 'node',
              args: ['server.js', '--port', '3000'],
            },
          },
        }),
        'claude',
        undefined,
      )
    })

    it('should install with custom name', async () => {
      const argv: ArgumentsCamelCase<InstallArgv> = {
        client: 'claude',
        target: 'test-package',
        name: 'custom-name',
        yes: true,
        _: [],
        $0: 'install-mcp',
      }

      await handler(argv)

      expect(mockClientConfig.writeConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          mcpServers: {
            'custom-name': {
              command: 'npx',
              args: ['test-package'],
            },
          },
        }),
        'claude',
        undefined,
      )
    })

    it('should prompt for confirmation when not using --yes', async () => {
      const argv: ArgumentsCamelCase<InstallArgv> = {
        client: 'claude',
        target: 'test-package',
        _: [],
        $0: 'install-mcp',
      }

      mockLogger.prompt.mockResolvedValueOnce(true)

      await handler(argv)

      expect(mockLogger.prompt).toHaveBeenCalledWith(
        expect.stringContaining('Install MCP server "test-package" in claude?'),
        { type: 'confirm' },
      )
    })

    it('should not install when user cancels', async () => {
      const argv: ArgumentsCamelCase<InstallArgv> = {
        client: 'claude',
        target: 'test-package',
        _: [],
        $0: 'install-mcp',
      }

      mockLogger.prompt.mockResolvedValueOnce(false)

      await handler(argv)

      expect(mockClientConfig.writeConfig).not.toHaveBeenCalled()
    })

    it('should handle local installation', async () => {
      const argv: ArgumentsCamelCase<InstallArgv> = {
        client: 'claude',
        target: 'test-package',
        local: true,
        yes: true,
        _: [],
        $0: 'install-mcp',
      }

      await handler(argv)

      expect(mockClientConfig.writeConfig).toHaveBeenCalledWith(
        expect.any(Object),
        'claude',
        true, // local flag
      )
    })

    it('should handle warp client differently', async () => {
      const argv: ArgumentsCamelCase<InstallArgv> = {
        client: 'warp',
        target: 'test-package',
        yes: true,
        _: [],
        $0: 'install-mcp',
      }

      await handler(argv)

      expect(mockLogger.info).toHaveBeenCalledWith('Warp requires a manual installation through their UI.')
      expect(mockLogger.log).toHaveBeenCalledWith(expect.stringContaining('"test-package"'))
      expect(mockClientConfig.writeConfig).not.toHaveBeenCalled()
    })

    it('should handle warp client with URL', async () => {
      const argv: ArgumentsCamelCase<InstallArgv> = {
        client: 'warp',
        target: 'https://example.com/server',
        yes: true,
        _: [],
        $0: 'install-mcp',
      }

      await handler(argv)

      expect(mockLogger.log).toHaveBeenCalledWith(expect.stringContaining('"mcp-remote@latest"'))
      expect(mockLogger.log).toHaveBeenCalledWith(expect.stringContaining('"https://example.com/server"'))
    })

    it('should handle different config structures', async () => {
      const argv: ArgumentsCamelCase<InstallArgv> = {
        client: 'vscode',
        target: 'test-package',
        yes: true,
        _: [],
        $0: 'install-mcp',
      }

      mockClientConfig.getConfigPath.mockReturnValue({
        type: 'file',
        path: '/test/settings.json',
        configKey: 'mcp.servers',
      })

      // Mock the config to have the nested structure for VSCode
      mockClientConfig.readConfig.mockReturnValue({ mcp: { servers: {} } })

      await handler(argv)

      expect(mockClientConfig.writeConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          mcp: {
            servers: {
              'test-package': {
                command: 'npx',
                args: ['test-package'],
              },
            },
          },
        }),
        'vscode',
        undefined,
      )
    })

    it('should handle existing servers in config', async () => {
      const argv: ArgumentsCamelCase<InstallArgv> = {
        client: 'claude',
        target: 'new-package',
        yes: true,
        _: [],
        $0: 'install-mcp',
      }

      mockClientConfig.readConfig.mockReturnValue({
        mcpServers: {
          'existing-server': {
            command: 'node',
            args: ['existing.js'],
          },
        },
      })

      mockClientConfig.getNestedValue.mockImplementation((obj, path) => {
        if (path === 'mcpServers') return obj.mcpServers
        return undefined
      })

      await handler(argv)

      expect(mockClientConfig.writeConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          mcpServers: {
            'existing-server': {
              command: 'node',
              args: ['existing.js'],
            },
            'new-package': {
              command: 'npx',
              args: ['new-package'],
            },
          },
        }),
        'claude',
        undefined,
      )
    })

    it('should handle headers with URL installation', async () => {
      const argv: ArgumentsCamelCase<InstallArgv> = {
        client: 'cline',
        target: 'https://example.com/server',
        header: ['Authorization: Bearer token123', 'X-Custom: value'],
        yes: true,
        _: [],
        $0: 'install-mcp',
      }

      await handler(argv)

      expect(mockClientConfig.writeConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          mcpServers: {
            'example-com': {
              command: 'npx',
              args: [
                '-y',
                'mcp-remote@latest',
                'https://example.com/server',
                '--header',
                'Authorization: Bearer token123',
                '--header',
                'X-Custom: value',
              ],
            },
          },
        }),
        'cline',
        undefined,
      )
    })

    it('should handle headers with warp client', async () => {
      const argv: ArgumentsCamelCase<InstallArgv> = {
        client: 'warp',
        target: 'https://example.com/server',
        header: ['Authorization: Bearer token123'],
        yes: true,
        _: [],
        $0: 'install-mcp',
      }

      await handler(argv)

      expect(mockLogger.log).toHaveBeenCalledWith(expect.stringContaining('"--header"'))
      expect(mockLogger.log).toHaveBeenCalledWith(expect.stringContaining('"Authorization: Bearer token123"'))
    })

    it('should handle error during write', async () => {
      const argv: ArgumentsCamelCase<InstallArgv> = {
        client: 'claude',
        target: 'test-package',
        yes: true,
        _: [],
        $0: 'install-mcp',
      }

      const error = new Error('Write failed')
      mockClientConfig.writeConfig.mockImplementation(() => {
        throw error
      })

      await handler(argv)

      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Write failed'))
    })

    it('should infer name from npx command', async () => {
      const argv: ArgumentsCamelCase<InstallArgv> = {
        client: 'claude',
        target: 'npx -y @org/mcp-server',
        yes: true,
        _: [],
        $0: 'install-mcp',
      }

      await handler(argv)

      expect(mockClientConfig.writeConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          mcpServers: {
            '@org/mcp-server': {
              command: 'npx',
              args: ['-y', '@org/mcp-server'],
            },
          },
        }),
        'claude',
        undefined,
      )
    })

    it('should infer name from URL', async () => {
      const argv: ArgumentsCamelCase<InstallArgv> = {
        client: 'claude',
        target: 'https://api.example.com/mcp',
        yes: true,
        _: [],
        $0: 'install-mcp',
      }

      await handler(argv)

      expect(mockClientConfig.writeConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          mcpServers: {
            'api-example-com': expect.any(Object),
          },
        }),
        'claude',
        undefined,
      )
    })

    it('should handle malformed URL', async () => {
      const argv: ArgumentsCamelCase<InstallArgv> = {
        client: 'claude',
        target: 'https://[invalid-url',
        yes: true,
        _: [],
        $0: 'install-mcp',
      }

      await handler(argv)

      expect(mockClientConfig.writeConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          mcpServers: {
            '[invalid-url': expect.any(Object),
          },
        }),
        'claude',
        undefined,
      )
    })
  })
})
