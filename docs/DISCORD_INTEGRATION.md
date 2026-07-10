# Discord Integration

SoundPad Pro connects to your locally running Discord desktop app over Discord's
RPC protocol. This first release establishes the **connection and one-time
authorization** — the foundation later features (mute/deafen toggles, Rich
Presence) build on. No voice or presence commands are sent yet.

## How It Works

- SoundPad Pro talks to Discord through the local IPC named pipe
  (`\\?\pipe\discord-ipc-0` … `-9`) using a direct Node implementation of the
  Discord RPC handshake — no browser, no external service.
- On first connect, Discord shows its **native authorization popup** asking you
  to approve SoundPad Pro (scopes: `rpc`, `identify`).
- The resulting access token is stored locally so future launches reconnect
  **silently** (the token is refreshed automatically when it expires).
- If Discord isn't running, SoundPad Pro retries every 10 seconds in the
  background. It never blocks app startup.

## One-Time Setup

Discord RPC requires an **application client ID and client secret**. SoundPad Pro
reuses the **same Discord Application** as the prelive web app — you paste the
credentials in once and they're stored locally.

### 1. Get your Client ID and Client Secret

1. Open the [Discord Developer Portal](https://discord.com/developers/applications)
2. Select the **same application** the prelive web app uses (the one whose
   `DISCORD_CLIENT_ID` prelive is configured with)
3. Go to **OAuth2**
4. Copy the **Client ID**
5. Under **Client Secret**, click **Reset Secret** (or copy the existing one) and
   copy the value
6. Under **Redirects**, make sure `http://localhost` is registered (add it if
   it's missing). If prelive uses a different redirect you want to reuse, you can
   enter that instead in step 3 below.

### 2. Enter the credentials in SoundPad Pro

1. Click the **Discord** badge in the header (or open **Settings → Integrations →
   Discord**)
2. Paste your **Client ID**
3. Paste your **Client Secret**
4. Leave **Redirect URI** as `http://localhost` unless you registered a different
   one in the Discord portal — it must match exactly
5. Click **Connect to Discord**

### 3. Approve the authorization popup

1. Make sure the **Discord desktop app is running** and you're signed in
2. When you click Connect, Discord shows an **Authorize** popup — approve it
3. The badge turns green and shows your Discord account name

That's it. On later launches SoundPad Pro reconnects automatically without
prompting again.

## Connection Status

The **Discord badge** (header and sidebar) reflects live connection state:

| State | Meaning |
| --- | --- |
| Not connected | Idle, or no credentials entered |
| Connecting… | Opening the pipe / handshaking |
| Waiting for authorization… | Approve the popup in Discord |
| Connected | Authorized; account name shown |
| (red) error text | Last failure reason (auto-retries in the background) |

The status updates automatically as Discord starts, stops, or is restarted.

## Where Things Are Stored

Credentials and tokens are stored locally via `electron-store`:

- `discord-client-config` — client ID, client secret, redirect URI
- `discord-rpc-auth` — access token, refresh token, and expiry

The client secret is stored locally and is **never sent to the SoundPad Pro
renderer** — the settings UI only learns whether a secret is already saved.

## Troubleshooting

### Cannot Connect / "Discord IPC pipe not found"

1. Make sure the **Discord desktop app** is running (the web app in a browser
   does not expose the RPC pipe)
2. Sign in to Discord
3. SoundPad Pro retries every 10 seconds — start Discord and it will connect

### Authorization popup never appears

1. Confirm the Discord desktop app is focused/running
2. Verify the **Client ID** is correct (from the same app as prelive)
3. Try **Disconnect** then **Connect to Discord** again

### "invalid_client" or token errors

1. Double-check the **Client Secret** — reset it in the Developer Portal and
   re-paste if unsure
2. Ensure the **Redirect URI** exactly matches one registered under OAuth2 →
   Redirects in the Discord application
3. Reconnect after correcting the values

### It re-prompts every launch

- This means the token wasn't persisted. Reconnect once and approve the popup;
  the token is saved to `discord-rpc-auth` for subsequent launches.

## Technical Details

**Protocol**: Discord RPC over local IPC named pipe
**Transport**: Node `net` (named pipe) — no native dependency
**Frame format**: `[opcode int32 LE][length int32 LE][UTF-8 JSON]`
**Auth**: OAuth2 authorization-code grant via `https://discord.com/api/oauth2/token`
**Scopes**: `rpc`, `identify`
**Storage**: `electron-store` (`discord-client-config`, `discord-rpc-auth`)

## Privacy & Security

- Credentials and tokens are stored locally on your machine only
- The client secret never leaves the main process
- The connection is entirely local (named pipe to your own Discord client)
- No data is sent to external servers beyond Discord's own OAuth token endpoint

## Not Yet Implemented

This story is **connection + authorization only**. The following are planned for
later stories and are intentionally not wired up yet:

- Mute / deafen control (`SET_VOICE_SETTINGS`)
- Rich Presence / activity (`SET_ACTIVITY`)

---

**Connected and ready.** 🎮
