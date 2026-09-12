/**
 * WHOOP MCP server.
 *
 * Run with:  bun run src/index.ts   (or point your MCP client at it)
 * Requires .whoop-tokens.json created by `bun run auth`.
 */
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";
import { whoopGet, type Paginated, type Recovery } from "./whoop";

// ---- Shared input helpers ----

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Accepts `YYYY-MM-DD` (local time) or a full ISO 8601 datetime. */
const dateOrDatetime = z
  .string()
  .refine((s) => DATE_ONLY.test(s) || !Number.isNaN(Date.parse(s)), {
    message: "Expected YYYY-MM-DD or an ISO 8601 datetime",
  });

/**
 * Expand a date-only string to an ISO datetime at local midnight.
 * For `end`, a date-only value is treated as inclusive (midnight of the next day).
 */
function toIso(value: string | undefined, boundary: "start" | "end"): string | undefined {
  if (value === undefined) return undefined;
  if (!DATE_ONLY.test(value)) return new Date(value).toISOString();
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d + (boundary === "end" ? 1 : 0)).toISOString();
}

/** Query parameters shared by every paginated WHOOP collection endpoint. */
const rangeInput = z.object({
  limit: z.number().int().min(1).max(25).default(10).describe("Number of records to return (max 25)"),
  start: dateOrDatetime.optional().describe("Earliest record, inclusive. YYYY-MM-DD (local) or ISO 8601 datetime"),
  end: dateOrDatetime.optional().describe("Latest record. YYYY-MM-DD is inclusive of that day; ISO datetime is exclusive"),
  next_token: z.string().optional().describe("Pagination token from a previous response"),
});

// ---- Output schemas (mirror the WHOOP v2 API, minus user_id) ----

const recoverySchema = z.object({
  cycle_id: z.number(),
  sleep_id: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  score_state: z.enum(["SCORED", "PENDING_SCORE", "UNSCORABLE"]),
  score: z
    .object({
      user_calibrating: z.boolean(),
      recovery_score: z.number(),
      resting_heart_rate: z.number(),
      hrv_rmssd_milli: z.number(),
      spo2_percentage: z.number().optional(),
      skin_temp_celsius: z.number().optional(),
    })
    .optional(),
});

const paginated = <T extends z.ZodTypeAny>(record: T) =>
  z.object({ records: z.array(record), next_token: z.string().nullable() });

// ---- Server ----

serveStdio(() => {
  const server = new McpServer(
    { name: "whoop", version: "0.2.0" },
    { capabilities: { tools: {} } },
  );

  server.registerTool(
    "get_recovery",
    {
      title: "Get WHOOP recovery",
      description:
        "Fetch the user's WHOOP recovery records, newest first. Each record has recovery_score (0-100), " +
        "hrv_rmssd_milli (HRV in ms), resting_heart_rate (bpm), spo2_percentage and skin_temp_celsius. " +
        "A recovery is scored after the sleep referenced by sleep_id; created_at is when it was scored. " +
        "Use start/end to select a date range and next_token to page. Note: WHOOP matches the range against " +
        "the underlying sleep window, so a range ending on day N also returns the recovery scored on the morning of N+1.",
      inputSchema: rangeInput,
      outputSchema: paginated(recoverySchema),
    },
    async ({ limit, start, end, next_token }) => {
      const data = await whoopGet<Paginated<Recovery>>("/recovery", {
        limit,
        start: toIso(start, "start"),
        end: toIso(end, "end"),
        nextToken: next_token,
      });

      const output = {
        records: data.records.map(({ user_id: _, ...record }) => record),
        next_token: data.next_token ?? null,
      };
      return {
        content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    },
  );

  return server;
});
