import type { ArgumentsCamelCase, Argv } from "yargs"
import process from "node:process"
import { logger } from "../logger"
import { blue, green, red } from "picocolors"
import {
  clientNames,
  readConfig,
  writeConfig,
  getConfigPath,
  getNestedValue,
  setNestedValue,
  type ClientConfig,
} from "../client-config"
import { spawn } from "node:child_process"

const isWindows = process.platform === "win32"

// On Windows, shell scripts like `npx` cannot be spawned directly by MCP clients
// because they use child_process.spawn() without shell:true. The standard workaround
// is to wrap the command with `cmd /c` so Windows can resolve the .cmd/.ps1 shim.
function wrapCommandForPlatform(command: string, args: Array<string>): { command: string; args: Array<string> } {
  if (isWindows) {
    return { command: "cmd", args: ["/c", command, ...args] }
  }
  return { command, args }
}

// Helper to set a server config in a nested structure
function setServerConfig(
  config: ClientConfig,
  configKey: string,
  serverName: string,
  serverConfig: ClientConfig,
  client: string
): void {
  // Get or create the nested config object
  let servers = getNestedValue(config, configKey)
  if (!servers) {
    setNestedValue(config, configKey, {})
    servers = getNestedValue(config, configKey)
  }

  // Set the server config
  if (servers) {
    if (client === "goose") {
      // Goose has a different config structure and uses 'envs' instead of 'env'
      const { env, command, args, ...rest } = serverConfig
      servers[serverName] = {
        name: serverName,
        cmd: command,
        args: args,
        enabled: true,
        envs: env || {},
        type: "stdio",
        timeout: 300,
        ...rest, // Allow overriding other defaults
      }
    } else if (client === "zed") {
      // Zed has a different config structure
      servers[serverName] = {
        source: "custom",
        command: serverConfig.command,
        args: serverConfig.args,
        env: serverConfig.env || {},
        ...serverConfig, // Allow overriding defaults
      }
    } else if (client === "opencode") {
      // OpenCode has a different config structure for MCP servers
      // Check for npx directly or wrapped via cmd /c npx (Windows)
      const isNpxCommand =
        serverConfig.command === "npx" ||
        (serverConfig.command === "cmd" && serverConfig.args?.[0] === "/c" && serverConfig.args?.[1] === "npx")
      const isNpxMcpRemote = isNpxCommand && serverConfig.args?.includes("mcp-remote@latest")
      if (isNpxMcpRemote) {
        // For remote MCP servers, OpenCode uses a different structure
        const urlIndex = serverConfig.args.indexOf("mcp-remote@latest") + 1
        const url = serverConfig.args[urlIndex]
        const headers: Record<string, string> = {}

        // Extract headers from args
        let i = serverConfig.args.indexOf("--header") + 1
        while (i > 0 && i < serverConfig.args.length) {
          const headerArg = serverConfig.args[i]
          if (headerArg && !headerArg.startsWith("--")) {
            const [key, value] = headerArg.split(":")
            if (key && value) {
              headers[key.trim()] = value.trim()
            }
          }
          i = serverConfig.args.indexOf("--header", i) + 1
        }

        servers[serverName] = {
          type: "remote",
          url: url,
          enabled: true,
          headers: Object.keys(headers).length > 0 ? headers : undefined,
        }
      } else {
        // For local MCP servers
        servers[serverName] = {
          type: "local",
          command: serverConfig.command,
          args: serverConfig.args || [],
          enabled: true,
          environment: {},
        }
      }
    } else {
      servers[serverName] = serverConfig
    }
  }
}

export interface InstallArgv {
  target?: string
  name?: string
  client?: string
  local?: boolean
  yes?: boolean
  header?: Array<string>
  oauth?: "yes" | "no"
  project?: string
  env?: Array<string>
}

export const command = "$0 [target]"
export const describe = "Install MCP server"

export function builder(yargs: Argv<InstallArgv>): Argv {
  return yargs
    .positional("target", {
      type: "string",
      description: "Package name, full command, or URL to install",
    })
    .option("name", {
      type: "string",
      description: "Name of the server (auto-extracted from target if not provided)",
    })
    .option("client", {
      type: "string",
      description: "Client to use for installation",
    })
    .option("local", {
      type: "boolean",
      description: "Install to the local directory instead of the default location",
      default: false,
    })
    .option("yes", {
      type: "boolean",
      alias: "y",
      description: "Skip confirmation prompt",
      default: false,
    })
    .option("header", {
      type: "array",
      description: 'Headers to pass to the server (format: "Header: value")',
      default: [],
    })
    .option("project", { type: "string", description: "Project for https://api.supermemory.ai/*" })
    .option("oauth", {
      type: "string",
      description: "Whether the server uses OAuth authentication (yes/no). If not specified, you will be prompted.",
      choices: ["yes", "no"],
    } as const)
    .option("env", {
      type: "array",
      description: "Environment variables to pass to the server (format: --env key value)",
      default: [],
    })
}

function isUrl(input: string): boolean {
  return input.startsWith("http://") || input.startsWith("https://")
}

function isCommand(input: string): boolean {
  return input.includes(" ") || input.startsWith("npx ") || input.startsWith("node ")
}

function inferNameFromInput(input: string): string {
  if (isUrl(input)) {
    // For URLs like https://example.com/path -> example-com
    try {
      const url = new URL(input)
      return url.hostname.replace(/\./g, "-")
    } catch {
      // Fallback for malformed URLs
      const parts = input.split("/")
      return parts[parts.length - 1] || "server"
    }
  } else if (isCommand(input)) {
    // For commands, extract package name
    const parts = input.split(" ")
    if (parts[0] === "npx" && parts.length > 1) {
      // Skip flags like -y and get the package name
      const packageIndex = parts.findIndex((part, index) => index > 0 && !part.startsWith("-"))
      if (packageIndex !== -1) {
        return parts[packageIndex] || "server"
      }
    }
    return parts[0] || "server"
  } else {
    // Simple package name like "mcp-server" or "@org/mcp-server"
    return input
  }
}

function buildCommand(input: string): string {
  if (isUrl(input)) {
    return input // URLs are handled separately
  } else if (isCommand(input)) {
    return input // Already a full command
  } else {
    // Simple package name, convert to npx command
    return `npx ${input}`
  }
}

function isSupermemoryUrl(input: string): boolean {
  try {
    const url = new URL(input)
    return url.hostname === "api.supermemory.ai"
  } catch {
    return false
  }
}

// Parse environment variables from array format into key-value object
function parseEnvVars(envArray?: Array<string>): { [key: string]: string } | undefined {
  if (!envArray || envArray.length === 0) {
    return undefined
  }

  const envObj: { [key: string]: string } = {}
  for (let i = 0; i < envArray.length; i += 2) {
    const key = envArray[i]
    const value = envArray[i + 1]
    if (key && value !== undefined) {
      envObj[key] = value
    }
  }

  return Object.keys(envObj).length > 0 ? envObj : undefined
}

// Run the authentication flow for remote servers before installation.
async function runAuthentication(url: string): Promise<void> {
  logger.info(`Running authentication for ${url}`)
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["-y", "-p", "mcp-remote@latest", "mcp-remote-client", url], {
      stdio: ["ignore", "ignore", "ignore"], // Hide all output
      shell: isWindows, // Required on Windows where npx is a .cmd script
    })

    child.on("close", (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`Authentication exited with code ${code}`))
      }
    })

    child.on("error", reject)
  })
}

export async function handler(argv: ArgumentsCamelCase<InstallArgv>) {
  let client = argv.client

  if (!client || !clientNames.includes(client)) {
    client = (await logger.prompt("Select a client to install for:", {
      type: "select",
      options: clientNames.map((name) => ({ value: name, label: name })),
    })) as string
  }

  let target = argv.target
  if (!target) {
    target = (await logger.prompt("Enter the package name, command, or URL:", {
      type: "text",
    })) as string
  }

  const name = argv.name || inferNameFromInput(target)
  const command = buildCommand(target)
  const envVars = parseEnvVars(argv.env)

  // Resolve Supermemory project header when installing its URL
  let projectHeader: string | undefined
  if (isUrl(target) && isSupermemoryUrl(target)) {
    let project = typeof argv.project === "string" ? argv.project : undefined
    if (!project || project.trim() === "") {
      const input = (await logger.prompt(
        'Enter your Supermemory project (no spaces). Press Enter for "default" (you can override per LLM session).',
        { type: "text" }
      )) as string
      project = (input || "").trim() || "default"
    }
    if (/\s/.test(project)) {
      logger.error("Project must not contain spaces. Use hyphens or underscores instead.")
      return
    }
    projectHeader = `x-sm-project:${project}`
  }

  if (client === "warp") {
    logger.log("")
    logger.info("Warp requires a manual installation through their UI.")
    logger.log("  Please copy the following configuration object and add it to your Warp MCP config:\n")

    // Build args array for Warp
    let warpArgs: Array<string>
    if (isUrl(target)) {
      warpArgs = ["-y", "mcp-remote@latest", target]
      // Add headers as arguments for supergateway
      if (argv.header && argv.header.length > 0) {
        for (const header of argv.header) {
          warpArgs.push("--header", header)
        }
      }
      if (projectHeader) {
        warpArgs.push("--header", projectHeader)
      }
    } else {
      warpArgs = command.split(" ").slice(1)
    }

    logger.log(
      JSON.stringify(
        {
          [name]: {
            command: isUrl(target) ? "npx" : command.split(" ")[0],
            args: warpArgs,
            env: envVars || {},
            working_directory: null,
            start_on_launch: true,
          },
        },
        null,
        2
      )
        .split("\n")
        .map((line) => green(`  ${line}`))
        .join("\n")
    )
    logger.box("Read Warp's documentation at", blue("https://docs.warp.dev/knowledge-and-collaboration/mcp"))
    return
  }

  logger.info(`Installing MCP server "${name}" for ${client}${argv.local ? " (locally)" : ""}`)

  let ready = argv.yes
  if (!ready) {
    ready = await logger.prompt(green(`Install MCP server "${name}" in ${client}?`), {
      type: "confirm",
    })
  }

  if (ready) {
    if (isUrl(target)) {
      // Determine if we should use OAuth
      let usesOAuth: boolean
      if (argv.oauth === "yes") {
        usesOAuth = true
      } else if (argv.oauth === "no") {
        usesOAuth = false
      } else {
        // Ask if the server uses OAuth
        usesOAuth = await logger.prompt("Does this server use OAuth authentication?", {
          type: "confirm",
        })
      }

      if (usesOAuth) {
        try {
          await runAuthentication(target)
        } catch {
          logger.error("Authentication failed. Use the client to authenticate.")
          return
        }
      }
    }

    try {
      const config = readConfig(client, argv.local)
      const configPath = getConfigPath(client, argv.local)
      const configKey = configPath.configKey

      if (isUrl(target)) {
        // URL-based installation

        const args = ["-y", "mcp-remote@latest", target]
        // Add headers as arguments for supergateway
        if (argv.header && argv.header.length > 0) {
          for (const header of argv.header) {
            args.push("--header", header)
          }
        }
        if (projectHeader) {
          args.push("--header", projectHeader)
        }
        const wrapped = wrapCommandForPlatform("npx", args)
        const serverConfig: ClientConfig = {
          command: wrapped.command,
          args: wrapped.args,
        }
        if (envVars) {
          serverConfig.env = envVars
        }
        setServerConfig(config, configKey, name, serverConfig, client)
      } else {
        // Command-based installation (including simple package names)
        const cmdParts = command.split(" ")
        const wrapped = wrapCommandForPlatform(cmdParts[0] || command, cmdParts.slice(1))
        const serverConfig: ClientConfig = {
          command: wrapped.command,
          args: wrapped.args,
        }
        if (envVars) {
          serverConfig.env = envVars
        }
        setServerConfig(config, configKey, name, serverConfig, client)
      }

      writeConfig(config, client, argv.local)
      logger.box(green(`Successfully installed MCP server "${name}" in ${client}${argv.local ? " (locally)" : ""}`))
    } catch (e) {
      logger.error(red((e as Error).message))
    }
  }
}
