import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals'
import type { ArgumentsCamelCase } from 'yargs'
import { handler, InstallArgv } from './install'
import * as clientConfig from '../client-config'
import { logger } from '../logger'

// Mock dependencies
jest.mock('../client-config')
jest.mock('../logger')

const mockClientConfig = clientConfig as jest.Mocked<typeof clientConfig>
const mockLogger = logger as jest.Mocked<typeof logger>

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

    it('should install URL with supergateway for non-direct-URL clients', async () => {
      const argv: ArgumentsCamelCase<InstallArgv> = {
        client: 'cline',
        target: 'https://example.com/server',
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
              args: ['-y', 'supergateway', '--sse', 'https://example.com/server'],
            },
          },
        }),
        'cline',
        undefined,
      )
    })

    it('should install URL directly for cursor/claude/vscode clients', async () => {
      const argv: ArgumentsCamelCase<InstallArgv> = {
        client: 'cursor',
        target: 'https://example.com/server',
        yes: true,
        _: [],
        $0: 'install-mcp',
      }

      await handler(argv)

      expect(mockClientConfig.writeConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          mcpServers: {
            'example-com': {
              url: 'https://example.com/server',
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

    it('should handle npx command', async () => {
      const argv: ArgumentsCamelCase<InstallArgv> = {
        client: 'claude',
        target: 'npx -y @modelcontextprotocol/server-filesystem',
        yes: true,
        _: [],
        $0: 'install-mcp',
      }

      await handler(argv)

      expect(mockClientConfig.writeConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          mcpServers: {
            '@modelcontextprotocol/server-filesystem': {
              command: 'npx',
              args: ['-y', '@modelcontextprotocol/server-filesystem'],
            },
          },
        }),
        'claude',
        undefined,
      )
    })

    it('should use custom name if provided', async () => {
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

    it('should install locally when local flag is set', async () => {
      const argv: ArgumentsCamelCase<InstallArgv> = {
        client: 'claude',
        target: 'test-package',
        local: true,
        yes: true,
        _: [],
        $0: 'install-mcp',
      }

      await handler(argv)

      expect(mockClientConfig.writeConfig).toHaveBeenCalledWith(expect.anything(), 'claude', true)
    })

    it('should handle warp client with manual instructions', async () => {
      const argv: ArgumentsCamelCase<InstallArgv> = {
        client: 'warp',
        target: 'test-package',
        yes: true,
        _: [],
        $0: 'install-mcp',
      }

      await handler(argv)

      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Warp requires a manual installation'))
      expect(mockLogger.box).toHaveBeenCalledWith(
        expect.stringContaining("Read Warp's documentation"),
        expect.any(String),
      )
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

      expect(mockLogger.log).toHaveBeenCalledWith(expect.stringContaining('"command": "npx"'))
      expect(mockLogger.log).toHaveBeenCalledWith(expect.stringContaining('supergateway'))
    })

    it('should prompt for confirmation when yes flag is not set', async () => {
      const argv: ArgumentsCamelCase<InstallArgv> = {
        client: 'claude',
        target: 'test-package',
        _: [],
        $0: 'install-mcp',
      }

      mockLogger.prompt.mockResolvedValueOnce(true)

      await handler(argv)

      expect(mockLogger.prompt).toHaveBeenCalledWith(expect.stringContaining('Install MCP server'), { type: 'confirm' })
    })

    it('should not install if user declines confirmation', async () => {
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

    it('should handle writeConfig error', async () => {
      const argv: ArgumentsCamelCase<InstallArgv> = {
        client: 'claude',
        target: 'test-package',
        yes: true,
        _: [],
        $0: 'install-mcp',
      }

      mockClientConfig.writeConfig.mockImplementation(() => {
        throw new Error('Write error')
      })

      await handler(argv)

      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Write error'))
    })

    it('should handle vscode with nested config key', async () => {
      mockClientConfig.getConfigPath.mockReturnValue({
        type: 'file',
        path: '/test/config.json',
        configKey: 'mcp.servers',
      })

      const argv: ArgumentsCamelCase<InstallArgv> = {
        client: 'vscode',
        target: 'test-package',
        yes: true,
        _: [],
        $0: 'install-mcp',
      }

      await handler(argv)

      expect(mockClientConfig.writeConfig).toHaveBeenCalledWith(expect.any(Object), 'vscode', undefined)
    })
  })

  describe('name inference', () => {
    it('should infer name from URL', async () => {
      const argv: ArgumentsCamelCase<InstallArgv> = {
        client: 'claude',
        target: 'https://api.example.com/server',
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

    it('should infer name from npx command', async () => {
      const argv: ArgumentsCamelCase<InstallArgv> = {
        client: 'claude',
        target: 'npx -y @test/package',
        yes: true,
        _: [],
        $0: 'install-mcp',
      }

      await handler(argv)

      expect(mockClientConfig.writeConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          mcpServers: {
            '@test/package': expect.any(Object),
          },
        }),
        'claude',
        undefined,
      )
    })

    it('should infer name from node command', async () => {
      const argv: ArgumentsCamelCase<InstallArgv> = {
        client: 'claude',
        target: 'node script.js',
        yes: true,
        _: [],
        $0: 'install-mcp',
      }

      await handler(argv)

      expect(mockClientConfig.writeConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          mcpServers: {
            node: expect.any(Object),
          },
        }),
        'claude',
        undefined,
      )
    })

    it('should handle malformed URL', async () => {
      const argv: ArgumentsCamelCase<InstallArgv> = {
        client: 'claude',
        target: 'https://malformed/url/path',
        yes: true,
        _: [],
        $0: 'install-mcp',
      }

      await handler(argv)

      expect(mockClientConfig.writeConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          mcpServers: {
            malformed: expect.any(Object),
          },
        }),
        'claude',
        undefined,
      )
    })
  })
})
