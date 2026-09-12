# Privacy

This software runs entirely on your own computer.

- Your WHOOP data is fetched from the WHOOP API only when an MCP client you control
  asks for it, and it is passed directly to that client. Nothing is sent anywhere else.
- Your WHOOP app credentials and OAuth tokens are stored on your machine in
  `~/.config/whoop-mcp/`, readable only by your user account. They are never
  transmitted to anyone except WHOOP.
- No analytics, telemetry, or crash reporting of any kind is collected.
- The author of this software never has access to your data, credentials, or tokens.

Because each user registers their own WHOOP app and is its only user, you are the
only party in the OAuth flow. The WHOOP app you register is yours, and this page
exists to satisfy the privacy policy URL that WHOOP requires when creating it.

To revoke access, delete `~/.config/whoop-mcp/` and remove the app from your
WHOOP developer dashboard.
