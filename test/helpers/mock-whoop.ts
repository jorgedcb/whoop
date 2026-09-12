/**
 * A local stand-in for api.prod.whoop.com that serves the fixtures and
 * records every request so tests can assert on paths and query strings.
 */
import recovery from "../fixtures/recovery.json";
import sleep from "../fixtures/sleep.json";
import workout from "../fixtures/workout.json";
import cycle from "../fixtures/cycle.json";
import profile from "../fixtures/profile.json";
import body from "../fixtures/body.json";

export interface RecordedRequest {
  method: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  body?: string;
}

/** Routes in match order. `record` routes return the first record of the collection fixture. */
const ROUTES: Array<[RegExp, unknown, "collection" | "record"]> = [
  [/^\/developer\/v2\/activity\/sleep\/[^/]+$/, sleep, "record"],
  [/^\/developer\/v2\/activity\/workout\/[^/]+$/, workout, "record"],
  [/^\/developer\/v2\/cycle\/\d+$/, cycle, "record"],
  [/^\/developer\/v2\/cycle\/\d+\/sleep$/, sleep, "record"],
  [/^\/developer\/v2\/cycle\/\d+\/recovery$/, recovery, "record"],
  [/^\/developer\/v2\/recovery$/, recovery, "collection"],
  [/^\/developer\/v2\/activity\/sleep$/, sleep, "collection"],
  [/^\/developer\/v2\/activity\/workout$/, workout, "collection"],
  [/^\/developer\/v2\/cycle$/, cycle, "collection"],
  [/^\/developer\/v2\/user\/profile\/basic$/, profile, "collection"],
  [/^\/developer\/v2\/user\/measurement\/body$/, body, "collection"],
];

export function startMockWhoop() {
  const requests: RecordedRequest[] = [];

  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      const rec: RecordedRequest = {
        method: req.method,
        path: url.pathname,
        query: Object.fromEntries(url.searchParams),
        headers: Object.fromEntries(req.headers),
      };
      if (req.method === "POST") rec.body = await req.text();
      requests.push(rec);

      if (url.pathname === "/oauth/oauth2/token") {
        return Response.json({
          access_token: "refreshed-access",
          refresh_token: "refreshed-refresh",
          expires_in: 3600,
          scope: "offline read:recovery",
          token_type: "bearer",
        });
      }

      // Tests assert on the exact bearer via the recorded headers; here only require that one was sent.
      if (!req.headers.get("authorization")?.startsWith("Bearer ")) {
        return Response.json({ error: "unauthorized" }, { status: 401 });
      }

      for (const [pattern, fixture, kind] of ROUTES) {
        if (!pattern.test(url.pathname)) continue;
        return Response.json(kind === "record" ? (fixture as { records: unknown[] }).records[0] : fixture);
      }
      return Response.json({ error: "not found", path: url.pathname }, { status: 404 });
    },
  });

  return {
    url: `http://localhost:${server.port}`,
    requests,
    /** Requests to the developer API only (excludes token refreshes). */
    apiRequests: () => requests.filter((r) => r.path.startsWith("/developer/")),
    stop: () => server.stop(true),
  };
}
