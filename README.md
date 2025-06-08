# Install MCP CLI

### A CLI tool to install and manage MCP servers running OAuth with dynamic client registration.

There wasn't an easy solution, so I built one on top of the existing "mcp-install".

## Usage

Just run
`npx mcp-i '<command>' --client <client> --name <your-mcp-name> --gateway <gateway-provider> --host <optional-oauth-callback>`

Also works with SSE URLs
`npx mcp-i '<url>' --client <client>`

where `<client>` is one of the following:

- `claude`
- `cline`
- `roo-cline`
- `windsurf`
- `witsy`
- `enconvo`
- `cursor`

## License

MIT
