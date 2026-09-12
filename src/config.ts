/**
 * Where credentials and tokens live, and how they are read and written.
 *
 * Default location: ~/.config/whoop-mcp/
 *   credentials.json  client_id, client_secret, redirect_uri (from `auth`)
 *   tokens.json       access/refresh tokens (from `auth`, updated on refresh)
 *
 * Overrides:
 *   WHOOP_CONFIG_DIR       change the directory
 *   WHOOP_TOKEN_FILE       change the tokens file path
 *   WHOOP_CLIENT_ID / WHOOP_CLIENT_SECRET / WHOOP_REDIRECT_URI
 *                          take precedence over credentials.json
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { PACKAGE_NAME } from "./version.js";

export const AUTH_COMMAND = `npx ${PACKAGE_NAME} auth`;
export const DEFAULT_REDIRECT_URI = "http://localhost:3000/callback";

export const CONFIG_DIR = process.env.WHOOP_CONFIG_DIR
  ? resolve(process.env.WHOOP_CONFIG_DIR)
  : join(homedir(), ".config", "whoop-mcp");

export const CREDENTIALS_FILE = join(CONFIG_DIR, "credentials.json");
export const TOKEN_FILE = process.env.WHOOP_TOKEN_FILE
  ? resolve(process.env.WHOOP_TOKEN_FILE)
  : join(CONFIG_DIR, "tokens.json");

export interface Credentials {
  client_id: string;
  client_secret: string;
  redirect_uri: string;
}

export interface StoredTokens {
  access_token: string;
  refresh_token: string;
  /** Unix ms timestamp when access_token expires. */
  expires_at: number;
  scope: string;
}

/** Shape of WHOOP's token endpoint response. */
export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
}

async function readJson<T>(path: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw err;
  }
}

/** Write JSON readable only by the current user. */
async function writeJson(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, JSON.stringify(data, null, 2) + "\n", { mode: 0o600 });
}

/** Credentials from the environment (partial), used to override or pre-fill the saved ones. */
export function credentialsFromEnv(): Partial<Credentials> {
  const out: Partial<Credentials> = {};
  if (process.env.WHOOP_CLIENT_ID) out.client_id = process.env.WHOOP_CLIENT_ID;
  if (process.env.WHOOP_CLIENT_SECRET) out.client_secret = process.env.WHOOP_CLIENT_SECRET;
  if (process.env.WHOOP_REDIRECT_URI) out.redirect_uri = process.env.WHOOP_REDIRECT_URI;
  return out;
}

export async function loadSavedCredentials(): Promise<Credentials | undefined> {
  return readJson<Credentials>(CREDENTIALS_FILE);
}

export type CredentialSource = "environment" | "saved config" | "none";

/**
 * Merge default < credentials.json < environment. May be incomplete (no client ID/secret).
 * `source` names where the client ID came from. Skips the file read when env is complete.
 */
export async function resolveCredentials(): Promise<{
  creds: Partial<Credentials> & { redirect_uri: string };
  source: CredentialSource;
}> {
  const env = credentialsFromEnv();
  const complete = (c: Partial<Credentials>) => Boolean(c.client_id && c.client_secret);
  const saved = complete(env) ? undefined : await loadSavedCredentials();
  const creds = { redirect_uri: DEFAULT_REDIRECT_URI, ...saved, ...env };
  const source: CredentialSource = complete(env) ? "environment" : complete(creds) ? "saved config" : "none";
  return { creds, source };
}

/** Environment first, then credentials.json. Throws with guidance if neither is complete. */
export async function getCredentials(): Promise<Credentials> {
  const { creds, source } = await resolveCredentials();
  if (source === "none") {
    throw new Error(
      `WHOOP client credentials not found. Run \`${AUTH_COMMAND}\` to set them up, ` +
        `or set WHOOP_CLIENT_ID and WHOOP_CLIENT_SECRET.`,
    );
  }
  return creds as Credentials;
}

export async function saveCredentials(creds: Credentials): Promise<void> {
  await writeJson(CREDENTIALS_FILE, creds);
}

/** Tokens from disk, or undefined when the file does not exist. Other read errors propagate. */
export async function loadSavedTokens(): Promise<StoredTokens | undefined> {
  return readJson<StoredTokens>(TOKEN_FILE);
}

export async function loadTokens(): Promise<StoredTokens> {
  const tokens = await loadSavedTokens();
  if (!tokens) {
    throw new Error(`No WHOOP tokens found at ${TOKEN_FILE}. Run \`${AUTH_COMMAND}\` to connect your account.`);
  }
  return tokens;
}

export async function saveTokens(raw: TokenResponse): Promise<StoredTokens> {
  const tokens: StoredTokens = {
    access_token: raw.access_token,
    refresh_token: raw.refresh_token,
    expires_at: Date.now() + raw.expires_in * 1000,
    scope: raw.scope,
  };
  await writeJson(TOKEN_FILE, tokens);
  return tokens;
}
