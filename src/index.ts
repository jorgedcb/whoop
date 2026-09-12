/**
 * WHOOP MCP server.
 *
 * Run with:  bun run src/index.ts   (or point your MCP client at it)
 * Requires .whoop-tokens.json created by `bun run auth`.
 */
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { registerTools } from "./tools";

serveStdio(() => {
  const server = new McpServer({ name: "whoop", version: "0.3.0" }, { capabilities: { tools: {} } });
  registerTools(server);
  return server;
});
