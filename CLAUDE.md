# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- `npm run build` - Build the project using tsup
- `npm run build:watch` - Build with watch mode
- `npm run start` - Run the CLI locally using ts-node
- `npm run start:node` - Run the built CLI from dist/
- `npm run test` - Run Jest tests
- `npm run test:watch` - Run tests in watch mode
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Run ESLint with auto-fix
- `npm run format` - Check code formatting with Prettier
- `npm run format:fix` - Auto-format code with Prettier
- `npm run compile` - Type-check with TypeScript compiler

## Architecture

This is a CLI tool for installing and managing MCP (Model Context Protocol) servers across different AI clients. The core architecture:

### Entry Point
- `bin/run.ts` - Main CLI entry point using yargs for command parsing
- `bin/run` - Shell script that requires the built version

### Core Components
- `src/commands/install.ts` - Main install command logic that handles both URL and command-based MCP server installations
- `src/client-config.ts` - Client configuration management with platform-specific paths for different AI clients (Claude, Cline, Windsurf, Cursor, etc.)
- `src/logger.ts` - Logging utilities using consola

### Client Support
The tool supports multiple AI clients with different config file locations:
- Claude Desktop (`claude_desktop_config.json`)
- VS Code extensions (Cline, Roo-Cline) via globalStorage
- Windsurf, Witsy, Enconvo, Cursor - each with specific config paths

### Installation Types
- **URL-based**: Uses `supergateway` with `--sse` flag for SSE URLs
- **Command-based**: Directly installs commands with arguments
- **Local vs Global**: Supports both local project configs and global user configs

### Config Management
- Reads existing config files and merges new MCP servers
- Handles platform differences (Windows, macOS, Linux)
- Auto-creates config directories when needed
- Preserves existing configuration while adding new servers