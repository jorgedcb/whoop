/** `whoop-mcp status`: show where config lives and whether the account is connected. */
import { CONFIG_DIR, CREDENTIALS_FILE, TOKEN_FILE, AUTH_COMMAND, loadSavedTokens, resolveCredentials } from "./config.js";

export async function showStatus(): Promise<void> {
  console.log(`Config directory:  ${CONFIG_DIR}`);
  console.log(`Credentials file:  ${CREDENTIALS_FILE}`);
  console.log(`Tokens file:       ${TOKEN_FILE}\n`);

  const [{ creds, source }, tokens] = await Promise.all([resolveCredentials(), loadSavedTokens()]);
  if (source === "environment") console.log("Credentials:       from environment");
  else if (source === "saved config") console.log(`Credentials:       saved (client ID ends in ${creds.client_id!.slice(-4)})`);
  else console.log(`Credentials:       missing. Run \`${AUTH_COMMAND}\`.`);

  if (tokens) {
    const minutes = Math.round((tokens.expires_at - Date.now()) / 60_000);
    const state = minutes > 0 ? `valid for ${minutes} min` : `expired ${-minutes} min ago (refreshes automatically)`;
    console.log(`Tokens:            present, access token ${state}`);
    console.log(`Scopes:            ${tokens.scope}`);
  } else {
    console.log(`Tokens:            missing. Run \`${AUTH_COMMAND}\`.`);
  }
}
