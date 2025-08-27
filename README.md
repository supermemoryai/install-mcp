# Install MCP CLI

### A CLI tool to install and manage MCP servers.

Installing MCPs is a huge pain, so I made a CLI tool to make it easier.

## Usage

The CLI now supports multiple installation methods with automatic detection:

### Simple package names

```bash
npx install-mcp mcp-package-name --client claude
```

### Scoped packages

```bash
npx install-mcp @org/mcp-server --client claude
```

### Full commands (for custom arguments)

```bash
npx install-mcp 'npx some-mcp-server --custom-args' --client claude
```

### Remote URLs (with automatic naming)

```bash
npx install-mcp https://mcp.example.com/server --client claude
```

The tool automatically:

- Converts simple package names to `npx package-name`
- Preserves full commands as-is
- Infers server names from package names or URLs (e.g., `mcp.example.com` → `mcp-example-com`)
- Handles OAuth authentication for remote servers

### Supermemory project support

When installing a server hosted on `https://api.supermemory.ai/*`, you can pass a project name via `--project`. This is a convenience alias for adding the header `x-sm-project: <value>`.

Rules:

- Only applies to URL installs targeting `https://api.supermemory.ai/*`.
- Values must not contain spaces.
- If you omit `--project` for these URLs, you'll be prompted. Pressing Enter uses `default`.
- The value is injected as a header alongside any `--header` flags.

Examples:

```bash
# Explicit project
npx install-mcp https://api.supermemory.ai/servers/my-server \
  --client cursor \
  --project myproj

# Prompted for project (Enter defaults to "default")
npx install-mcp https://api.supermemory.ai/servers/my-server --client cursor
```

Warp users: the generated config will include `--header "x-sm-project: <value>"` in the `args` array when installing Supermemory URLs.

### Headers Support

You can pass headers for authentication or other purposes using the `--header` flag:

```bash
# Single header
npx install-mcp https://api.example.com/mcp --client claude --header "Authorization: Bearer token123"

# Multiple headers
npx install-mcp https://api.example.com/mcp --client claude \
  --header "Authorization: Bearer token123" \
  --header "X-API-Key: secret-key"
```

### OAuth Authentication for Remote Servers

When installing remote servers (URLs), the CLI will ask if the server uses OAuth authentication:

```bash
npx install-mcp https://api.example.com/mcp --client claude
# Output: Does this server use OAuth authentication? (Y/n)
```

You can bypass this prompt using the `--oauth` flag:

```bash
# Automatically run OAuth authentication
npx install-mcp https://api.example.com/mcp --client claude --oauth yes

# Skip OAuth authentication entirely
npx install-mcp https://api.example.com/mcp --client claude --oauth no
```

If you answer yes, the authentication flow:

- Runs automatically before installation
- Handles OAuth flows seamlessly in the background
- **Authentication state is shared globally** - once you authenticate with a server, that authentication is automatically available to all MCP clients
- No need to re-authenticate when using the same server in different clients

```bash
# Output: Running authentication for https://api.example.com/mcp
```

If authentication fails, you'll see:

```
Authentication failed. Use the client to authenticate.
```

If the server doesn't use OAuth (you answer no), the installation proceeds directly without authentication.

This ensures secure access to remote servers while maintaining flexibility for servers that don't require OAuth.

## Supported Clients

The `--client` flag specifies which MCP client you're installing for:

- `claude`
- `cline`
- `roo-cline`
- `windsurf`
- `witsy`
- `enconvo`
- `cursor`
- `vscode`
- `gemini-cli`
- `claude-code`
- `goose`
- `zed`
- `warp` (outputs config to copy/paste into Warp's cloud-based settings)

## License

MIT
