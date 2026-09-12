import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startMockWhoop } from "./helpers/mock-whoop";
import { startServer } from "./helpers/mcp-client";

const EXPECTED_TOOLS = [
  "get_recovery",
  "get_sleep",
  "get_sleep_by_id",
  "get_cycles",
  "get_cycle_by_id",
  "get_sleep_for_cycle",
  "get_recovery_for_cycle",
  "get_workouts",
  "get_workout_by_id",
  "get_profile",
  "get_body_measurements",
];

let mock: ReturnType<typeof startMockWhoop>;
let server: Awaited<ReturnType<typeof startServer>>;
const tokenFile = join(tmpdir(), `whoop-test-tokens-${process.pid}.json`);

async function writeTokens(expiresInMs: number) {
  await Bun.write(
    tokenFile,
    JSON.stringify({
      access_token: "test-access",
      refresh_token: "test-refresh",
      expires_at: Date.now() + expiresInMs,
      scope: "offline read:recovery",
    }),
  );
}

beforeAll(async () => {
  mock = startMockWhoop();
  await writeTokens(3_600_000);
  server = await startServer({
    WHOOP_API_BASE: mock.url,
    WHOOP_TOKEN_FILE: tokenFile,
    WHOOP_CONFIG_DIR: join(tmpdir(), `whoop-test-config-${process.pid}`),
    WHOOP_CLIENT_ID: "cid",
    WHOOP_CLIENT_SECRET: "secret",
    // Pin the server timezone so date-only expansion is deterministic and provably local.
    TZ: "America/New_York",
  });
});

afterAll(async () => {
  server.stop();
  mock.stop();
  await unlink(tokenFile).catch(() => {});
});

beforeEach(async () => {
  mock.requests.length = 0;
  // Every test starts from a valid, unexpired token regardless of what an earlier test did to the file.
  await writeTokens(3_600_000);
});

describe("tool registry", () => {
  test("exposes exactly one tool per WHOOP read endpoint", async () => {
    const names = (await server.listTools()).map((t) => t.name).sort();
    expect(names).toEqual([...EXPECTED_TOOLS].sort());
  });

  test("every tool has a description and an input schema", async () => {
    for (const tool of await server.listTools()) {
      expect(tool.description.length).toBeGreaterThan(20);
      expect(tool.inputSchema.type).toBe("object");
    }
  });
});

describe("collection tools", () => {
  test.each([
    ["get_recovery", "/developer/v2/recovery"],
    ["get_sleep", "/developer/v2/activity/sleep"],
    ["get_cycles", "/developer/v2/cycle"],
    ["get_workouts", "/developer/v2/activity/workout"],
  ])("%s hits %s with default limit and bearer token", async (tool, path) => {
    const res = await server.callTool(tool);
    expect(res.isError).toBeFalsy();
    const [req] = mock.apiRequests();
    expect(req!.path).toBe(path);
    expect(req!.query).toEqual({ limit: "10" });
    expect(req!.headers.authorization).toBe("Bearer test-access");
    expect(res.structuredContent.records.length).toBeGreaterThan(0);
  });

  test("maps input names to WHOOP query params and expands date-only values", async () => {
    await server.callTool("get_recovery", { limit: 5, start: "2026-09-10", end: "2026-09-11", next_token: "abc" });
    const [req] = mock.apiRequests();
    expect(req!.query).toEqual({
      limit: "5",
      start: "2026-09-10T04:00:00.000Z", // midnight EDT (UTC-4)
      end: "2026-09-12T04:00:00.000Z", // inclusive end: midnight of the next day
      nextToken: "abc",
    });
  });

  test("strips user_id from every record and normalises next_token", async () => {
    const res = await server.callTool("get_recovery");
    for (const r of res.structuredContent.records) expect(r).not.toHaveProperty("user_id");
    expect(res.structuredContent.next_token).toBe("MTIzOjEyMzEyMw");
    const sleep = await server.callTool("get_sleep");
    expect(sleep.structuredContent.next_token).toBeNull();
  });

  test("text content mirrors structured content", async () => {
    const res = await server.callTool("get_cycles");
    expect(JSON.parse(res.content[0]!.text)).toEqual(res.structuredContent);
  });

  test("rejects an invalid date with a helpful validation error, without calling WHOOP", async () => {
    const res = await server.callTool("get_sleep", { start: "last tuesday" });
    expect(res.isError).toBe(true);
    expect(res.content[0]!.text).toContain("YYYY-MM-DD");
    expect(mock.apiRequests()).toHaveLength(0);
  });

  test("rejects limit above 25", async () => {
    const res = await server.callTool("get_workouts", { limit: 50 });
    expect(res.isError).toBe(true);
    expect(mock.apiRequests()).toHaveLength(0);
  });
});

describe("lookup tools", () => {
  test.each([
    ["get_sleep_by_id", { sleep_id: "123e4567-e89b-12d3-a456-426614174000" }, "/developer/v2/activity/sleep/123e4567-e89b-12d3-a456-426614174000"],
    ["get_workout_by_id", { workout_id: "ecfc6a15-4661-442f-a9a4-f160dd7afae8" }, "/developer/v2/activity/workout/ecfc6a15-4661-442f-a9a4-f160dd7afae8"],
    ["get_cycle_by_id", { cycle_id: 93845 }, "/developer/v2/cycle/93845"],
    ["get_sleep_for_cycle", { cycle_id: 93845 }, "/developer/v2/cycle/93845/sleep"],
    ["get_recovery_for_cycle", { cycle_id: 93845 }, "/developer/v2/cycle/93845/recovery"],
    ["get_profile", {}, "/developer/v2/user/profile/basic"],
    ["get_body_measurements", {}, "/developer/v2/user/measurement/body"],
  ])("%s hits %s", async (tool, args, path) => {
    const res = await server.callTool(tool, args);
    expect(res.isError).toBeFalsy();
    expect(mock.apiRequests()[0]!.path).toBe(path);
    expect(res.structuredContent).not.toHaveProperty("user_id");
  });

  test("by-id tools reject a non-UUID", async () => {
    const res = await server.callTool("get_sleep_by_id", { sleep_id: "93845" });
    expect(res.isError).toBe(true);
    expect(mock.apiRequests()).toHaveLength(0);
  });
});

describe("token refresh", () => {
  test("refreshes an expired token before calling the API and persists the new one", async () => {
    await writeTokens(-1_000);
    const res = await server.callTool("get_profile");
    expect(res.isError).toBeFalsy();

    const refresh = mock.requests.find((r) => r.path === "/oauth/oauth2/token");
    expect(refresh).toBeDefined();
    const body = Object.fromEntries(new URLSearchParams(refresh!.body));
    expect(body).toMatchObject({ grant_type: "refresh_token", refresh_token: "test-refresh", client_id: "cid", client_secret: "secret" });

    // The API call that followed must have used the refreshed token.
    const [api] = mock.apiRequests();
    expect(api!.path).toBe("/developer/v2/user/profile/basic");
    expect(api!.headers.authorization).toBe("Bearer refreshed-access");

    const saved = await Bun.file(tokenFile).json();
    expect(saved.access_token).toBe("refreshed-access");
    expect(saved.refresh_token).toBe("refreshed-refresh");
    expect(saved.expires_at).toBeGreaterThan(Date.now());
  });
});
