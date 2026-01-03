import { describe, expect, test } from "bun:test"
import { clientNames, getConfigPath } from "./client-config"

describe("client-config", () => {
  describe("clientNames", () => {
    test("should include droid in supported clients", () => {
      expect(clientNames).toContain("droid")
    })

    test("should have at least 16 clients", () => {
      expect(clientNames.length).toBeGreaterThanOrEqual(16)
    })
  })

  describe("getConfigPath", () => {
    test("should return correct path for droid client", () => {
      const result = getConfigPath("droid")
      expect(result.configKey).toBe("mcpServers")
      expect(result.path).toContain(".factory")
      expect(result.path).toContain("mcp.json")
    })

    test("should return local path for droid when local flag is true", () => {
      const result = getConfigPath("droid", true)
      expect(result.path).toContain(".factory")
      expect(result.path).toContain("mcp.json")
      // Local path should be in current working directory
      expect(result.path).not.toContain(process.env.HOME || "/home/")
    })
  })
})
