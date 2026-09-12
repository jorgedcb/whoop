/**
 * Minimal WHOOP API client.
 *
 * Reads OAuth tokens from a local JSON file (written once by `bun run auth`),
 * refreshes the access token when it is about to expire, and exposes a
 * typed `get` helper for the v2 developer endpoints.
 */

const API_BASE = "https://api.prod.whoop.com";
export const TOKEN_URL = `${API_BASE}/oauth/oauth2/token`;
export const AUTH_URL = `${API_BASE}/oauth/oauth2/auth`;
export const TOKEN_FILE = new URL("../.whoop-tokens.json", import.meta.url).pathname;

export interface StoredTokens {
  access_token: string;
  refresh_token: string;
  /** Unix ms timestamp when access_token expires. */
  expires_at: number;
  scope: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}. Copy .env.example to .env and fill it in.`);
  return value;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
}

export async function saveTokens(raw: TokenResponse): Promise<StoredTokens> {
  const tokens: StoredTokens = {
    access_token: raw.access_token,
    refresh_token: raw.refresh_token,
    expires_at: Date.now() + raw.expires_in * 1000,
    scope: raw.scope,
  };
  await Bun.write(TOKEN_FILE, JSON.stringify(tokens, null, 2));
  return tokens;
}

async function loadTokens(): Promise<StoredTokens> {
  const file = Bun.file(TOKEN_FILE);
  if (!(await file.exists())) {
    throw new Error(`No WHOOP tokens found at ${TOKEN_FILE}. Run \`bun run auth\` first.`);
  }
  return (await file.json()) as StoredTokens;
}

async function refreshTokens(refreshToken: string): Promise<StoredTokens> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: requireEnv("WHOOP_CLIENT_ID"),
    client_secret: requireEnv("WHOOP_CLIENT_SECRET"),
    scope: "offline",
    refresh_token: refreshToken,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`WHOOP token refresh failed (${res.status}): ${await res.text()}`);
  }
  return saveTokens((await res.json()) as TokenResponse);
}

/** Returns a valid access token, refreshing it if it expires within 60 seconds. */
async function getAccessToken(): Promise<string> {
  let tokens = await loadTokens();
  if (Date.now() > tokens.expires_at - 60_000) {
    tokens = await refreshTokens(tokens.refresh_token);
  }
  return tokens.access_token;
}

/** GET a WHOOP developer v2 endpoint, e.g. `whoopGet("/recovery", { limit: 5 })`. */
export async function whoopGet<T>(
  path: string,
  query: Record<string, string | number | undefined> = {},
): Promise<T> {
  const url = new URL(`${API_BASE}/developer/v2${path}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  const token = await getAccessToken();
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    throw new Error(`WHOOP API ${path} failed (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as T;
}

// ---- Response types for the endpoints we use ----

export interface Paginated<T> {
  records: T[];
  next_token?: string;
}

export interface Recovery {
  cycle_id: number;
  sleep_id: string;
  user_id: number;
  created_at: string;
  updated_at: string;
  score_state: "SCORED" | "PENDING_SCORE" | "UNSCORABLE";
  score?: {
    user_calibrating: boolean;
    recovery_score: number;
    resting_heart_rate: number;
    hrv_rmssd_milli: number;
    spo2_percentage?: number;
    skin_temp_celsius?: number;
  };
}
