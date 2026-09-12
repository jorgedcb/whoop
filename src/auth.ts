/**
 * `whoop-mcp auth`: one-time OAuth2 login.
 *
 * Collects the WHOOP app credentials (from env, saved config, or a prompt),
 * starts a temporary local HTTP server for the OAuth callback, opens the
 * consent page in the browser, exchanges the code for tokens, and saves
 * everything under the config directory for the MCP server to use.
 *
 * The redirect URI must match exactly what is registered on the WHOOP app.
 */
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { createInterface } from "node:readline/promises";
import {
  CONFIG_DIR,
  TOKEN_FILE,
  resolveCredentials,
  saveCredentials,
  saveTokens,
  type Credentials,
  type TokenResponse,
} from "./config.js";
import { AUTH_URL, TOKEN_URL } from "./whoop.js";

const SCOPES = [
  "offline",
  "read:profile",
  "read:body_measurement",
  "read:recovery",
  "read:cycles",
  "read:sleep",
  "read:workout",
];

async function collectCredentials(): Promise<Credentials> {
  const { creds, source } = await resolveCredentials();

  if (source !== "none") {
    console.log(`Using client ID ${mask(creds.client_id!)} from ${source}.`);
    return creds as Credentials;
  }

  if (!process.stdin.isTTY) {
    throw new Error("No credentials found and no terminal to prompt. Set WHOOP_CLIENT_ID and WHOOP_CLIENT_SECRET.");
  }

  console.log("Create an app at https://developer-dashboard.whoop.com and paste its credentials.");
  console.log(`Make sure the app's redirect URI includes: ${creds.redirect_uri}\n`);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  // Without a listener, readline on Node < 20.19.5 / 22.15 swallows Ctrl+C and the pending
  // question never settles, so the process would exit 0 as if auth had succeeded.
  rl.on("SIGINT", () => {
    rl.close();
    process.exit(130);
  });
  try {
    const client_id = creds.client_id || (await rl.question("Client ID: ")).trim();
    const client_secret = creds.client_secret || (await rl.question("Client secret: ")).trim();
    const answer = (await rl.question(`Redirect URI [${creds.redirect_uri}]: `)).trim();
    const redirect_uri = answer || creds.redirect_uri;
    if (!client_id || !client_secret) throw new Error("Client ID and secret are required.");
    return { client_id, client_secret, redirect_uri };
  } finally {
    rl.close();
  }
}

const mask = (s: string) => (s.length > 8 ? `${s.slice(0, 4)}…${s.slice(-4)}` : "****");

function openBrowser(url: string) {
  const [cmd, args] =
    process.platform === "darwin" ? ["open", [url]]
    // cmd.exe treats a bare `&` as a command separator, so escape the query-string separators.
    : process.platform === "win32" ? ["cmd", ["/c", "start", "", url.replace(/&/g, "^&")]]
    : ["xdg-open", [url]];
  spawn(cmd, args, { stdio: "ignore", detached: true }).on("error", () => {}).unref();
}

/** Run the OAuth flow. Resolves when tokens are saved; rejects on any failure. */
export async function runAuth(): Promise<void> {
  const creds = await collectCredentials();
  const redirect = new URL(creds.redirect_uri);
  const port = Number(redirect.port || 80);
  const state = randomUUID();

  const authorizeUrl = new URL(AUTH_URL);
  authorizeUrl.searchParams.set("client_id", creds.client_id);
  authorizeUrl.searchParams.set("redirect_uri", creds.redirect_uri);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", SCOPES.join(" "));
  authorizeUrl.searchParams.set("state", state);

  const server = createServer();
  try {
    const scope = await new Promise<string>((resolve, reject) => {
      server.on("request", async (req, res) => {
        const url = new URL(req.url ?? "/", creds.redirect_uri);
        const reply = (status: number, text: string) => {
          // Connection: close so the browser's keep-alive socket does not hold the process open.
          res.writeHead(status, { "Content-Type": "text/plain", Connection: "close" });
          res.end(text);
        };
        const fail = (message: string, status = 400) => {
          reply(status, `${message} You can close this tab.`);
          reject(new Error(message));
        };

        if (url.pathname !== redirect.pathname) return reply(404, "Not found");
        const error = url.searchParams.get("error");
        if (error) return fail(`WHOOP returned an error: ${error} ${url.searchParams.get("error_description") ?? ""}`);
        if (url.searchParams.get("state") !== state) return fail("State mismatch; possible CSRF. Aborting.");
        const code = url.searchParams.get("code");
        if (!code) return fail("Missing authorization code.");

        try {
          const tokenRes = await fetch(TOKEN_URL, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              grant_type: "authorization_code",
              code,
              client_id: creds.client_id,
              client_secret: creds.client_secret,
              redirect_uri: creds.redirect_uri,
            }),
          });
          if (!tokenRes.ok) return fail(`Token exchange failed (${tokenRes.status}): ${await tokenRes.text()}`, 500);

          const tokens = await saveTokens((await tokenRes.json()) as TokenResponse);
          await saveCredentials(creds);
          reply(200, "WHOOP connected. You can close this tab and go back to the terminal.");
          resolve(tokens.scope);
        } catch (err) {
          // Network failure, bad JSON, unwritable config dir: report instead of an unhandled rejection.
          fail((err as Error).message, 500);
        }
      });

      server.on("error", (err: NodeJS.ErrnoException) => {
        reject(
          err.code === "EADDRINUSE"
            ? new Error(`Port ${port} is in use. Free it or register a different redirect URI.`)
            : err,
        );
      });

      server.listen(port, redirect.hostname, () => {
        console.log(`Listening for the OAuth callback on ${creds.redirect_uri}`);
        console.log(`Opening WHOOP login in your browser. If it does not open, visit:\n\n${authorizeUrl}\n`);
        openBrowser(authorizeUrl.toString());
      });
    });

    console.log(`Connected. Tokens saved to ${TOKEN_FILE}`);
    console.log(`Credentials saved to ${CONFIG_DIR}`);
    console.log(`Scopes: ${scope}`);
  } finally {
    server.close();
    server.closeIdleConnections();
  }
}
