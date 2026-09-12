/**
 * Minimal WHOOP API client: bearer auth with automatic refresh, plus a typed
 * GET helper for the v2 developer endpoints.
 */
import { getCredentials, loadTokens, saveTokens, type StoredTokens, type TokenResponse } from "./config.js";

/** Override with WHOOP_API_BASE (tests point this at a local mock). Empty values fall back to the default. */
const API_BASE = (process.env.WHOOP_API_BASE || "https://api.prod.whoop.com").replace(/\/+$/, "");
export const TOKEN_URL = `${API_BASE}/oauth/oauth2/token`;
export const AUTH_URL = `${API_BASE}/oauth/oauth2/auth`;

export interface Paginated<T> {
  records: T[];
  next_token?: string;
}

async function refreshTokens(refreshToken: string): Promise<StoredTokens> {
  const creds = await getCredentials();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: creds.client_id,
      client_secret: creds.client_secret,
      scope: "offline",
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) {
    throw new Error(`WHOOP token refresh failed (${res.status}): ${await res.text()}`);
  }
  return saveTokens((await res.json()) as TokenResponse);
}

/**
 * In-flight refresh shared by concurrent callers. WHOOP refresh tokens are single-use,
 * so two parallel tool calls must not each POST the same refresh_token.
 */
let refreshing: Promise<StoredTokens> | undefined;

/** Returns a valid access token, refreshing it if it expires within 60 seconds. */
async function getAccessToken(): Promise<string> {
  let tokens = await loadTokens();
  if (Date.now() > tokens.expires_at - 60_000) {
    refreshing ??= refreshTokens(tokens.refresh_token).finally(() => {
      refreshing = undefined;
    });
    tokens = await refreshing;
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
