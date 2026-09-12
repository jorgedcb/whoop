/**
 * One-time OAuth2 login for WHOOP.
 *
 * Usage:  bun run auth
 *
 * Starts a temporary local server for the OAuth callback, opens the WHOOP
 * consent page in your browser, exchanges the returned code for tokens, and
 * writes them to .whoop-tokens.json (gitignored) for the MCP server to use.
 *
 * The redirect URI must match exactly what you registered in the WHOOP
 * developer dashboard. Default: http://localhost:3000/callback
 */
import { AUTH_URL, TOKEN_URL, TOKEN_FILE, saveTokens, type TokenResponse } from "./whoop";

const clientId = process.env.WHOOP_CLIENT_ID;
const clientSecret = process.env.WHOOP_CLIENT_SECRET;
const redirectUri = process.env.WHOOP_REDIRECT_URI ?? "http://localhost:3000/callback";

if (!clientId || !clientSecret) {
  console.error("Set WHOOP_CLIENT_ID and WHOOP_CLIENT_SECRET in .env first (see .env.example).");
  process.exit(1);
}

const redirect = new URL(redirectUri);
const port = Number(redirect.port || 80);
const state = crypto.randomUUID();
const scopes = [
  "offline",
  "read:profile",
  "read:body_measurement",
  "read:recovery",
  "read:cycles",
  "read:sleep",
  "read:workout",
];

const authorizeUrl = new URL(AUTH_URL);
authorizeUrl.searchParams.set("client_id", clientId);
authorizeUrl.searchParams.set("redirect_uri", redirectUri);
authorizeUrl.searchParams.set("response_type", "code");
authorizeUrl.searchParams.set("scope", scopes.join(" "));
authorizeUrl.searchParams.set("state", state);

const server = Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname !== redirect.pathname) return new Response("Not found", { status: 404 });

    const error = url.searchParams.get("error");
    if (error) {
      finish(`WHOOP returned an error: ${error} ${url.searchParams.get("error_description") ?? ""}`);
      return new Response("Authorization failed. You can close this tab.", { status: 400 });
    }
    if (url.searchParams.get("state") !== state) {
      finish("State mismatch. Aborting.");
      return new Response("State mismatch.", { status: 400 });
    }
    const code = url.searchParams.get("code");
    if (!code) return new Response("Missing code.", { status: 400 });

    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: clientId!,
        client_secret: clientSecret!,
        redirect_uri: redirectUri,
      }),
    });
    if (!res.ok) {
      finish(`Token exchange failed (${res.status}): ${await res.text()}`);
      return new Response("Token exchange failed. Check the terminal.", { status: 500 });
    }
    const tokens = await saveTokens((await res.json()) as TokenResponse);
    finish(`Tokens saved to ${TOKEN_FILE}\nScopes: ${tokens.scope}`);
    return new Response("WHOOP connected. You can close this tab and go back to the terminal.");
  },
});

function finish(message: string) {
  console.log(message);
  setTimeout(() => {
    server.stop();
    process.exit(message.startsWith("Tokens saved") ? 0 : 1);
  }, 200);
}

console.log(`Listening for the OAuth callback on ${redirectUri}`);
console.log(`Opening WHOOP login in your browser. If it does not open, visit:\n\n${authorizeUrl}\n`);
Bun.spawn(["open", authorizeUrl.toString()]);
