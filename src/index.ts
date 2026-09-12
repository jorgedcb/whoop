#!/usr/bin/env node
/**
 * WHOOP MCP server CLI.
 *
 *   whoop-mcp          run the MCP server over stdio (what MCP clients launch)
 *   whoop-mcp auth     connect a WHOOP account (one time)
 *   whoop-mcp status   show config location and connection state
 */
import { PACKAGE_NAME, VERSION } from "./version.js";

const HELP = `${PACKAGE_NAME} ${VERSION}

Usage:
  whoop-mcp            Run the MCP server over stdio
  whoop-mcp auth       Connect your WHOOP account (opens a browser)
  whoop-mcp status     Show where config lives and whether you are connected

Environment (all optional):
  WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET   Override saved credentials
  WHOOP_REDIRECT_URI                      Default http://localhost:3000/callback
  WHOOP_CONFIG_DIR                        Default ~/.config/whoop-mcp
  WHOOP_TOKEN_FILE                        Default <config dir>/tokens.json
`;

async function main(command: string | undefined): Promise<void> {
  switch (command) {
    case undefined: {
      const { serve } = await import("./server.js");
      serve();
      break;
    }
    case "auth": {
      const { runAuth } = await import("./auth.js");
      await runAuth();
      break;
    }
    case "status": {
      const { showStatus } = await import("./status.js");
      await showStatus();
      break;
    }
    case "-h":
    case "--help":
    case "help":
      console.log(HELP);
      break;
    case "-v":
    case "--version":
      console.log(VERSION);
      break;
    default:
      throw new Error(`Unknown command: ${command}\n\n${HELP}`);
  }
}

try {
  await main(process.argv[2]);
} catch (err) {
  // exitCode (not exit()) lets pending stdout/socket writes drain before the process ends.
  console.error(`\n${process.argv[2] === "auth" ? "Auth failed: " : ""}${(err as Error).message}`);
  process.exitCode = 1;
}
