/** The MCP server over stdio. */
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { registerTools } from "./tools.js";
import { VERSION } from "./version.js";

export function serve(): void {
  serveStdio(() => {
    const server = new McpServer({ name: "whoop", version: VERSION }, { capabilities: { tools: {} } });
    registerTools(server);
    return server;
  });
}
