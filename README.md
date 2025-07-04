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

where `<client>` is one of the following:

- `claude`
- `cline`
- `roo-cline`
- `windsurf`
- `witsy`
- `enconvo`
- `cursor`
- `warp` (outputs config to copy/paste into Warp's cloud-based settings)

## License

MIT
