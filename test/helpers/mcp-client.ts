/**
 * Minimal JSON-RPC client that spawns the MCP server over stdio.
 * Enough to call initialize, tools/list and tools/call in tests.
 */
import { join } from "node:path";

const ENTRY = join(import.meta.dir, "..", "..", "src", "index.ts");

export interface ToolInfo {
  name: string;
  description: string;
  inputSchema: { type: string; properties?: Record<string, unknown> };
}

export interface ToolResult {
  isError?: boolean;
  content: Array<{ type: string; text: string }>;
  structuredContent?: any;
}

export async function startServer(env: Record<string, string>) {
  const proc = Bun.spawn(["bun", "run", ENTRY], {
    stdin: "pipe",
    stdout: "pipe",
    // Surface server errors in the test output instead of buffering them in an unread pipe.
    stderr: "inherit",
    env: { ...process.env, ...env },
  });

  let nextId = 0;
  const pending = new Map<number, { resolve: (msg: any) => void; reject: (err: Error) => void }>();

  const failAll = (reason: string) => {
    for (const { reject } of pending.values()) reject(new Error(reason));
    pending.clear();
  };

  (async () => {
    const decoder = new TextDecoder();
    let buffer = "";
    for await (const chunk of proc.stdout) {
      buffer += decoder.decode(chunk);
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        let msg: any;
        try {
          msg = JSON.parse(line);
        } catch {
          console.error(`mcp-client: ignoring non-JSON stdout line: ${line}`);
          continue;
        }
        const entry = msg.id != null ? pending.get(msg.id) : undefined;
        if (entry) {
          pending.delete(msg.id);
          entry.resolve(msg);
        }
      }
    }
    failAll(`MCP server exited (code ${await proc.exited}) before responding`);
  })();

  const send = (msg: object) => proc.stdin.write(JSON.stringify(msg) + "\n");
  const request = (method: string, params?: object) =>
    new Promise<any>((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      send({ jsonrpc: "2.0", id, method, params });
    });

  await request("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "test", version: "0" },
  });
  send({ jsonrpc: "2.0", method: "notifications/initialized" });

  return {
    listTools: async (): Promise<ToolInfo[]> => (await request("tools/list")).result.tools,
    callTool: async (name: string, args: object = {}): Promise<ToolResult> =>
      (await request("tools/call", { name, arguments: args })).result,
    stop: () => proc.kill(),
  };
}
