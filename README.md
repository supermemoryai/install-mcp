# Install MCP CLI

### A CLI tool to install and manage MCP servers.

Installing MCPs is a huge pain, so I made a CLI tool to make it easier.

## Usage

Just run
`npx install-mcp '<command>' --client <client>`

Also works with SSE URLs
`npx install-mcp '<url>' --client <client>`

where `<client>` is one of the following:

- `claude`
- `cline`
- `roo-cline`
- `windsurf`
- `witsy`
- `enconvo`

## License

MIT
