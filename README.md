# WHOOP MCP server

Connect your WHOOP data to Claude, Cursor, or any other MCP client. Ask things like
*"How did I sleep last night?"*, *"Compare my HRV on workout days vs rest days this week"*,
or *"What was my strain yesterday?"* and get answers from your own recovery, sleep,
strain and workout records.

- One tool per WHOOP API v2 read endpoint, returning the records as WHOOP sends them
- Runs with `npx`, no clone or build needed
- Tokens refresh automatically; you log in once

## Setup

You need Node 20 or newer and a WHOOP account.

### 1. Create a WHOOP app

WHOOP does not offer a shared public app, so each user registers their own. It takes two minutes.

1. Go to [developer-dashboard.whoop.com/apps/create](https://developer-dashboard.whoop.com/apps/create) and sign in with your normal WHOOP account.
2. Fill in the form. Only these fields matter:

   | Field | What to enter |
   |---|---|
   | **Name** | Anything, e.g. `My MCP server`. Only you will see it. |
   | **Logo** | Leave empty. |
   | **Contacts** | Your email address. |
   | **Privacy policy** | `https://github.com/jorgedcb/whoop/blob/main/PRIVACY.md` (it explains that all data stays on your machine) |
   | **Redirect URLs** | `http://localhost:3000/callback` exactly. The placeholder suggests https, but http on localhost is accepted. |
   | **Scopes** | Tick all six: `read:recovery`, `read:cycles`, `read:sleep`, `read:workout`, `read:profile`, `read:body_measurement`. |
   | **Webhooks** | Leave empty. |

3. Click **Create App**. The app page then shows your **Client ID** and **Client Secret**. Keep that page open for the next step.

You do not need to look for an `offline` scope. The CLI requests it during login so it can refresh tokens without asking you to sign in again.

### 2. Connect your account

```bash
npx @jorgedcb/whoop-mcp auth
```

Paste the client ID and secret when prompted. A browser tab opens for WHOOP login and consent.
When it says "WHOOP connected", credentials and tokens are saved under `~/.config/whoop-mcp/`
with owner-only permissions. You will not need to do this again.

Check the result at any time:

```bash
npx @jorgedcb/whoop-mcp status
```

### 3. Add the server to your MCP client

**Claude Desktop.** Open Settings, then Developer, then Edit Config, and add:

```json
{
  "mcpServers": {
    "whoop": {
      "command": "npx",
      "args": ["-y", "@jorgedcb/whoop-mcp"]
    }
  }
}
```

Quit and reopen Claude Desktop. The tools appear under the tools icon in a new chat.

**Claude Code.**

```bash
claude mcp add --scope user whoop -- npx -y @jorgedcb/whoop-mcp
```

**Cursor and others.** Any client that launches stdio MCP servers works with the same command and arguments.

## Tools

| Tool | WHOOP endpoint | What it returns |
|---|---|---|
| `get_recovery` | `GET /v2/recovery` | Recovery score, HRV, resting HR, SpO2, skin temperature |
| `get_sleep` | `GET /v2/activity/sleep` | Sleep stages, sleep need, performance, respiratory rate |
| `get_sleep_by_id` | `GET /v2/activity/sleep/{id}` | One sleep record |
| `get_cycles` | `GET /v2/cycle` | Daily strain, energy, heart rate per physiological cycle |
| `get_cycle_by_id` | `GET /v2/cycle/{id}` | One cycle |
| `get_sleep_for_cycle` | `GET /v2/cycle/{id}/sleep` | The sleep that closed a cycle |
| `get_recovery_for_cycle` | `GET /v2/cycle/{id}/recovery` | The recovery for a cycle |
| `get_workouts` | `GET /v2/activity/workout` | Sport, strain, heart-rate zones, distance |
| `get_workout_by_id` | `GET /v2/activity/workout/{id}` | One workout |
| `get_profile` | `GET /v2/user/profile/basic` | Name and email |
| `get_body_measurements` | `GET /v2/user/measurement/body` | Height, weight, max heart rate |

The collection tools take `limit` (max 25), `start`, `end` and `next_token` for paging.
`start` and `end` accept `YYYY-MM-DD` in your local time or a full ISO 8601 datetime.

Records are returned exactly as WHOOP sends them, minus your user id. Field names match the
[WHOOP API reference](https://developer.whoop.com/api), so their docs apply directly.

### A note on WHOOP days

WHOOP measures in *cycles*, which run from wake-up to the next wake-up rather than midnight to
midnight. A recovery is scored from the sleep that ends a cycle. When you ask for a date range,
WHOOP matches it against the activity's own window, so a range ending on day N also returns the
recovery scored on the morning of N+1.

## Configuration

Everything is optional. The defaults work after `auth`.

| Variable | Purpose | Default |
|---|---|---|
| `WHOOP_CLIENT_ID`, `WHOOP_CLIENT_SECRET` | Override the saved credentials | from `auth` |
| `WHOOP_REDIRECT_URI` | Must match the app's registered URI | `http://localhost:3000/callback` |
| `WHOOP_CONFIG_DIR` | Where credentials and tokens are stored | `~/.config/whoop-mcp` |
| `WHOOP_TOKEN_FILE` | Token file path (use an absolute path) | `<config dir>/tokens.json` |

To pass variables to the server, use your MCP client's `env` block for that server entry.
A `.env` file is not read.

## Troubleshooting

**"No WHOOP tokens found"** means `auth` has not run for the config directory the server is
using. Run `npx @jorgedcb/whoop-mcp status` to see which directory that is.

**"redirect_uri mismatch" during auth** means the URI registered on your WHOOP app differs
from the one the CLI is using. Both must be exactly `http://localhost:3000/callback`, or set
`WHOOP_REDIRECT_URI` to whatever you registered.

**"Port 3000 is in use"** during auth: stop whatever is on that port, or register a different
localhost URI on your app and set `WHOOP_REDIRECT_URI`.

**The server does not appear in Claude Desktop.** Almost always a JSON syntax error in the
config file. Settings, then Developer shows the parse error. Also confirm you fully quit the
app, since the config is only read at launch.

**Token refresh fails.** WHOOP rotates refresh tokens and they expire after long inactivity.
Run `auth` again.

## Development

Uses [Bun](https://bun.sh) for development and tests. The published package runs on plain Node.

```bash
bun install
bun run auth            # connect an account
bun run start           # run the server over stdio
bun test                # deterministic tests against a local mock of the WHOOP API
bun run typecheck
bun run build           # compile to build/ for Node
```

To point an MCP client at your checkout instead of the npm package, use
`bun run /path/to/whoop/src/index.ts` as the command.

## License

MIT
