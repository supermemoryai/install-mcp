# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) and similar coding agents when working with code in this repository.

## Development Commands

- `bun run build` - Build the project using tsup
- `bun run build:watch` - Build with watch mode
- `bun run start` - Run the CLI locally using ts-node
- `bun run start:node` - Run the built CLI from dist/
- `bun run test` - Run bun test suite
- `bun run test:watch` - Run tests in watch mode
- `bun run lint` - Run Biome linter
- `bun run lint:fix` - Run Biome linter with auto-fix
- `bun run format` - Check code formatting with Biome
- `bun run format:fix` - Auto-format code with Biome
- `bun run compile` - Type-check with TypeScript compiler

## Architecture Overview

This is a CLI tool for installing and managing MCP (Model Context Protocol) servers across different AI clients. The tool supports 14+ AI clients with different configuration formats and file locations.

### Core Entry Points

- `bin/run.ts` - Main CLI entry point using yargs for command parsing
- `bin/run` - Shell script that requires the built version

### Core Components

- `src/commands/install.ts` - Main install command logic handling URL and command-based installations
- `src/client-config.ts` - Client configuration management with platform-specific paths
- `src/detect-transport.ts` - Transport detection logic (stdio, sse, etc.)
- `src/logger.ts` - Logging utilities using consola
- `src/index.ts` - Command registration and CLI setup

## Client Support System

### Currently Supported Clients (14 total)

**Desktop Applications:**

- Claude Desktop (`claude-desktop`)
- Cursor (`cursor`)
- Windsurf (`windsurf`)
- Witsy (`witsy`)
- Enconvo (`enconvo`)

**VS Code Extensions:**

- Cline (`cline`)
- Roo-Cline (`roo-cline`)
- VS Code native (`vscode`)

**CLI Tools:**

- Warp (`warp`) - Outputs config for manual copy-paste
- Gemini CLI (`gemini-cli`)
- Claude Code (`claude-code`)
- Goose (`goose`)
- Zed (`zed`)
- Codex (`codex`)

### Configuration Formats Supported

- **JSON** (default): Most clients
- **YAML**: Goose client
- **TOML**: Codex client

## Installation Patterns

### Three Installation Types

1. **Simple Package Names**: `mcp-package-name` → converts to `npx mcp-package-name`
2. **Full Commands**: `'node server.js --port 3000'` → preserved as-is
3. **Remote URLs**: `https://api.example.com/server` → uses mcp-remote approach

### Server Configuration Structures

Different clients require different config structures:

**Standard Format (Claude, Cline, etc.):**

```json
{
  "mcpServers": {
    "server-name": {
      "command": "npx",
      "args": ["package-name"]
    }
  }
}
```

**Goose Format (YAML):**

```yaml
extensions:
  server-name:
    name: server-name
    cmd: npx
    args: [package-name]
    enabled: true
    envs: {}
    type: stdio
    timeout: 300
```

**Zed Format:**

```json
{
  "lsp": {
    "server-name": {
      "source": "custom",
      "command": "npx",
      "args": ["package-name"],
      "env": {}
    }
  }
}
```

## Adding New AI Clients

### Step 1: Define Client Configuration

Add your client to the `getClientPaths()` function in `src/client-config.ts`:

```typescript
export function getClientPaths(): Record<string, ClientFileTarget> {
  const { homeDir, platform, baseDir } = getPlatformPaths();

  return {
    // ... existing clients ...

    "new-client": {
      type: "file",
      path: path.join(baseDir, "NewClient", "config.json"),
      configKey: "mcpServers", // or 'mcp.servers', 'lsp', etc.
      format: "json", // optional: 'yaml' or 'toml' if not JSON
      localPath: path.join(process.cwd(), ".new-client", "config.json"), // optional local config
    },
  };
}
```

**Configuration Options:**

- `type: 'file'` - File-based configuration (only supported type currently)
- `path` - Absolute path to global config file
- `localPath` - Optional path for project-local config (used with `--local` flag)
- `configKey` - Nested key path (e.g., 'mcpServers', 'mcp.servers', 'lsp')
- `format` - File format: 'json' (default), 'yaml', or 'toml'

### Step 2: Add to Supported Clients

Add your client name to the `clientNames` array in `src/client-config.ts`:

```typescript
export const clientNames = [
  "claude",
  "cline",
  "roo-cline",
  "windsurf",
  "witsy",
  "enconvo",
  "cursor",
  "warp",
  "gemini-cli",
  "vscode",
  "claude-code",
  "goose",
  "zed",
  "codex",
  "new-client", // Add your client here
];
```

### Step 3: Handle Custom Server Structure (Optional)

If your client requires a different server configuration structure, add logic to `setServerConfig()` in `src/commands/install.ts`:

```typescript
function setServerConfig(
  client: string,
  servers: Record<string, any>,
  serverName: string,
  serverConfig: Record<string, any>,
) {
  switch (client) {
    case "new-client":
      // Custom structure for your client
      servers[serverName] = {
        name: serverName,
        executable: serverConfig.command,
        arguments: serverConfig.args,
        enabled: true,
        timeout: 300,
      };
      break;

    // ... existing cases ...
  }
}
```

### Step 4: Add Tests

Add test cases in `src/client-config.test.ts`:

```typescript
describe("new-client configuration", () => {
  it("should return correct paths for new-client", () => {
    const paths = getClientPaths();
    expect(paths["new-client"]).toBeDefined();
    expect(paths["new-client"].configKey).toBe("mcpServers");
    expect(paths["new-client"].path).toContain("NewClient");
  });
});
```

And add integration tests in `src/commands/install.test.ts`:

```typescript
describe("new-client installation", () => {
  it("should install MCP server for new-client", async () => {
    // Test your client installation
    const result = await installServer({
      target: "test-server",
      client: "new-client",
      name: "test-server",
    });
    expect(result).toBe(true);
  });
});
```

## Platform-Specific Path Patterns

### Windows

```typescript
{
  baseDir: process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming'),
  vscodePath: path.join('Code', 'User'),
}
```

### macOS

```typescript
{
  baseDir: path.join(homeDir, 'Library', 'Application Support'),
  vscodePath: path.join('Code', 'User'),
}
```

### Linux

```typescript
{
  baseDir: process.env.XDG_CONFIG_HOME || path.join(homeDir, '.config'),
  vscodePath: path.join('Code/User'),
}
```

## Configuration File Management

### Reading Configurations

The tool handles three file formats:

```typescript
// JSON (default)
const config = JSON.parse(fileContent);

// YAML
const config = yaml.load(fileContent) as ClientConfig;

// TOML
const config = TOML.parse(fileContent) as ClientConfig;
```

### Writing Configurations

```typescript
// JSON
const configContent = JSON.stringify(mergedConfig, null, 2);

// YAML
const configContent = yaml.dump(mergedConfig, {
  indent: 2,
  lineWidth: -1,
  noRefs: true,
});

// TOML
const configContent = TOML.stringify(mergedConfig);
```

### Nested Configuration Support

For clients with nested structures (like VS Code's `mcp.servers`), use:

```typescript
// Get nested value
function getNestedValue(
  obj: ClientConfig,
  path: string,
): ClientConfig | undefined {
  return path.split(".").reduce((current, key) => current?.[key], obj);
}

// Set nested value
function setNestedValue(
  obj: ClientConfig,
  path: string,
  value: ClientConfig,
): void {
  const keys = path.split(".");
  const lastKey = keys.pop()!;
  const target = keys.reduce((current, key) => {
    if (!current[key] || typeof current[key] !== "object") {
      current[key] = {};
    }
    return current[key];
  }, obj);
  target[lastKey] = value;
}
```

## Special Client Behaviors

### Warp (Output Only)

Warp doesn't support direct config file writing. Instead, it outputs the configuration for manual copy-paste:

```typescript
if (client === "warp") {
  logger.info(`Copy this configuration to Warp:`);
  logger.box(JSON.stringify(serverConfig, null, 2));
  return true;
}
```

### Supermemory URL Headers

For URLs hosted on `https://api.supermemory.ai/*`, automatic project header injection:

```typescript
if (targetUrl.startsWith("https://api.supermemory.ai/")) {
  const project = options.project || "default";
  args.unshift("--header", `x-sm-project: ${project}`);
}
```

## Testing Guidelines

### Unit Testing Pattern

```typescript
import { describe, it, expect, beforeEach, mock } from "bun:test";
import fs from "node:fs";

// Mock file system operations
const mockReadFileSync = mock(() => "{}");
const mockWriteFileSync = mock(() => {});
const mockExistsSync = mock(() => true);

mock.module("node:fs", () => ({
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync,
  existsSync: mockExistsSync,
}));
```

### Integration Testing Pattern

```typescript
describe("MCP installation", () => {
  it("should install package for different clients", async () => {
    const testCases = [
      { client: "claude", expectedPath: /claude_desktop_config\.json/ },
      { client: "cursor", expectedPath: /cursor.*mcp\.json/ },
      { client: "vscode", expectedPath: /settings\.json/ },
    ];

    for (const testCase of testCases) {
      const result = await installServer({
        target: "test-package",
        client: testCase.client,
      });
      expect(result).toBe(true);
      expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
      expect(mockWriteFileSync.mock.calls[0][0]).toMatch(testCase.expectedPath);
    }
  });
});
```

## Common Pitfalls & Solutions

### 1. Platform Path Issues

**Problem**: Hardcoded paths don't work across platforms  
**Solution**: Always use `getPlatformPaths()` helper function

### 2. Configuration Format Mismatches

**Problem**: Wrong config structure for a client  
**Solution**: Check existing client definitions and test with actual config files

### 3. Missing Nested Keys

**Problem**: Config file doesn't have expected nested structure  
**Solution**: Use `getNestedValue()` and `setNestedValue()` helpers

### 4. File Permissions

**Problem**: Can't write to config directories  
**Solution**: Use recursive directory creation and handle permission errors

### 5. Special Client Requirements

**Problem**: Client needs special server configuration format  
**Solution**: Add custom handling in `setServerConfig()` function

## Development Workflow

1. **Start the CLI**: `bun run start --client your-client --help`
2. **Test Installation**: `bun run start your-package --client your-client`
3. **Verify Config**: Check the generated config file matches expected format
4. **Run Tests**: `bun run test`
5. **Check Formatting**: `bun run format:fix`
6. **Lint Code**: `bun run lint:fix`

## Configuration Templates

### Standard JSON Client

```json
{
  "mcpServers": {
    "server-name": {
      "command": "npx",
      "args": ["package-name"]
    }
  }
}
```

### YAML Client (like Goose)

```yaml
extensions:
  server-name:
    name: server-name
    cmd: npx
    args: [package-name]
    enabled: true
    type: stdio
```

### TOML Client (like Codex)

```toml
[mcp_servers.server-name]
command = "npx"
args = ["package-name"]
```

This comprehensive guide should enable you to add new AI clients, extend functionality, and maintain the codebase effectively.
