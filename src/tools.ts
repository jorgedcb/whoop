/**
 * MCP tool registrations. Each tool is a thin wrapper over one WHOOP v2 endpoint.
 */
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { whoopGet, type Paginated } from "./whoop";
import * as s from "./schemas";

// ---- Input helpers ----

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Accepts `YYYY-MM-DD` (local time) or a full ISO 8601 datetime. */
const dateOrDatetime = z
  .string()
  .refine((v) => DATE_ONLY.test(v) || !Number.isNaN(Date.parse(v)), {
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
type RangeInput = z.infer<typeof rangeInput>;

const RANGE_NOTE =
  " Use start/end to select a date range and next_token to page. " +
  "WHOOP matches the range against the activity's own start/end window.";

/** Strip user_id and return an MCP tool result carrying both text and structured content. */
function result<T extends object>(output: T) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(output, null, 2) }],
    structuredContent: output,
  };
}

/** WHOOP responses carry user_id on the wire; our schemas leave it out. */
type Wire<T> = T & { user_id?: number };

function dropUserId<T extends object>({ user_id: _, ...rest }: Wire<T>): T {
  return rest as T;
}

async function collection<T extends object>(path: string, input: RangeInput) {
  const data = await whoopGet<Paginated<Wire<T>>>(path, {
    limit: input.limit,
    start: toIso(input.start, "start"),
    end: toIso(input.end, "end"),
    nextToken: input.next_token,
  });
  return { records: data.records.map((r) => dropUserId<T>(r)), next_token: data.next_token ?? null };
}

// ---- Registration ----

export function registerTools(server: McpServer) {
  server.registerTool(
    "get_recovery",
    {
      title: "Get WHOOP recovery",
      description:
        "Recovery records, newest first. Each has recovery_score (0-100), hrv_rmssd_milli (HRV in ms), " +
        "resting_heart_rate (bpm), spo2_percentage and skin_temp_celsius. A recovery is scored after the sleep " +
        "referenced by sleep_id; created_at is when it was scored. Note: the date range is matched against the " +
        "underlying sleep window, so a range ending on day N also returns the recovery scored on the morning of N+1." +
        RANGE_NOTE,
      inputSchema: rangeInput,
      outputSchema: s.paginated(s.recoverySchema),
    },
    async (input) => result(await collection<s.Recovery>("/recovery", input)),
  );

  server.registerTool(
    "get_sleep",
    {
      title: "Get WHOOP sleep",
      description:
        "Sleep records (including naps, flagged by `nap`), newest first. score.stage_summary holds time in each " +
        "stage in milliseconds; score.sleep_needed breaks down how much sleep was required; " +
        "sleep_performance_percentage is actual vs needed. Times are UTC with timezone_offset for local conversion." +
        RANGE_NOTE,
      inputSchema: rangeInput,
      outputSchema: s.paginated(s.sleepSchema),
    },
    async (input) => result(await collection<s.Sleep>("/activity/sleep", input)),
  );

  server.registerTool(
    "get_sleep_by_id",
    {
      title: "Get WHOOP sleep by ID",
      description: "A single sleep record by its UUID, e.g. the sleep_id from a recovery record.",
      inputSchema: z.object({ sleep_id: z.string().uuid() }),
      outputSchema: s.sleepSchema,
    },
    async ({ sleep_id }) => result(dropUserId(await whoopGet<Wire<s.Sleep>>(`/activity/sleep/${sleep_id}`))),
  );

  server.registerTool(
    "get_cycles",
    {
      title: "Get WHOOP cycles",
      description:
        "Physiological cycles (one per WHOOP 'day', running from wake-up to the next wake-up), newest first. " +
        "score.strain is the day strain (0-21); kilojoule is energy burned. The current cycle has no `end`." +
        RANGE_NOTE,
      inputSchema: rangeInput,
      outputSchema: s.paginated(s.cycleSchema),
    },
    async (input) => result(await collection<s.Cycle>("/cycle", input)),
  );

  const cycleIdInput = z.object({ cycle_id: z.number().int().describe("Numeric cycle id, e.g. from get_cycles or a recovery record") });

  server.registerTool(
    "get_cycle_by_id",
    {
      title: "Get WHOOP cycle by ID",
      description: "A single physiological cycle by its numeric id.",
      inputSchema: cycleIdInput,
      outputSchema: s.cycleSchema,
    },
    async ({ cycle_id }) => result(dropUserId(await whoopGet<Wire<s.Cycle>>(`/cycle/${cycle_id}`))),
  );

  server.registerTool(
    "get_sleep_for_cycle",
    {
      title: "Get WHOOP sleep for cycle",
      description: "The sleep that closed the given cycle, i.e. the night at the end of that WHOOP day.",
      inputSchema: cycleIdInput,
      outputSchema: s.sleepSchema,
    },
    async ({ cycle_id }) => result(dropUserId(await whoopGet<Wire<s.Sleep>>(`/cycle/${cycle_id}/sleep`))),
  );

  server.registerTool(
    "get_recovery_for_cycle",
    {
      title: "Get WHOOP recovery for cycle",
      description: "The recovery score computed for the given cycle, based on the sleep that preceded it.",
      inputSchema: cycleIdInput,
      outputSchema: s.recoverySchema,
    },
    async ({ cycle_id }) => result(dropUserId(await whoopGet<Wire<s.Recovery>>(`/cycle/${cycle_id}/recovery`))),
  );

  server.registerTool(
    "get_workouts",
    {
      title: "Get WHOOP workouts",
      description:
        "Workout records, newest first. sport_name identifies the activity; score.strain is workout strain (0-21); " +
        "zone_durations is time in each heart-rate zone in milliseconds; distance and altitude are present only " +
        "when GPS data was recorded." +
        RANGE_NOTE,
      inputSchema: rangeInput,
      outputSchema: s.paginated(s.workoutSchema),
    },
    async (input) => result(await collection<s.Workout>("/activity/workout", input)),
  );

  server.registerTool(
    "get_workout_by_id",
    {
      title: "Get WHOOP workout by ID",
      description: "A single workout record by its UUID.",
      inputSchema: z.object({ workout_id: z.string().uuid() }),
      outputSchema: s.workoutSchema,
    },
    async ({ workout_id }) => result(dropUserId(await whoopGet<Wire<s.Workout>>(`/activity/workout/${workout_id}`))),
  );

  server.registerTool(
    "get_profile",
    {
      title: "Get WHOOP profile",
      description: "The authenticated user's name and email.",
      inputSchema: z.object({}),
      outputSchema: s.profileSchema,
    },
    async () => result(dropUserId(await whoopGet<Wire<s.Profile>>("/user/profile/basic"))),
  );

  server.registerTool(
    "get_body_measurements",
    {
      title: "Get WHOOP body measurements",
      description: "The user's height (meters), weight (kilograms) and max heart rate as configured in WHOOP.",
      inputSchema: z.object({}),
      outputSchema: s.bodyMeasurementSchema,
    },
    async () => result(await whoopGet<s.BodyMeasurement>("/user/measurement/body")),
  );
}
