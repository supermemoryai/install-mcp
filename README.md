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

### SSE URLs (with automatic naming)

```bash
npx install-mcp https://mcp.example.com/server/sse --client claude
```

The tool automatically:

- Converts simple package names to `npx package-name`
- Preserves full commands as-is
- Infers server names from package names or URLs (e.g., `mcp.example.com` → `mcp-example-com`)
- Handles URL-based servers with supergateway SSE support

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

### Transport Methods for Remote Servers

When installing remote servers (URLs), the CLI needs to know which transport method the server uses. There are two transport methods:

- **Streamable HTTP** (modern, recommended)
- **SSE** (legacy)

The CLI handles this in several ways:

#### Automatic Detection

By default, the CLI will automatically detect the transport method:

```bash
npx install-mcp https://api.example.com/mcp --client claude
# Output: Detecting transport type... this may take a few seconds.
# Output: We've detected that this server uses the streamable HTTP transport method. Is this correct? (Y/n)
```

If the detection succeeds, it will ask you to confirm. If you answer "no", it will use the other transport method.

#### Manual Specification

You can skip detection by specifying the transport method directly:

```bash
# For streamable HTTP servers
npx install-mcp https://api.example.com/mcp --client claude --transport http

# For legacy SSE servers
npx install-mcp https://api.example.com/mcp --client claude --transport sse
```

#### Fallback to Manual Questions

If auto-detection fails, the CLI will ask you directly:

```
Could not auto-detect transport type, please answer the following questions:
Does this server support the streamable HTTP transport method? (Y/n)
```

Note: This only applies to URL-based installations. Package names and custom commands don't require transport selection.

where `<client>` is one of the following:

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
- `warp` (outputs config to copy/paste into Warp's cloud-based settings)

## License

MIT
