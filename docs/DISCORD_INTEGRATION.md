# Discord Integration

SoundPad Pro connects to your locally running Discord desktop app over Discord's
RPC protocol. It establishes a **connection and one-time authorization**, then
lets you map controller pads to **mute / deafen / push-to-talk** actions that
change your live Discord voice state.

## How It Works

- SoundPad Pro talks to Discord through the local IPC named pipe
  (`\\?\pipe\discord-ipc-0` … `-9`) using a direct Node implementation of the
  Discord RPC handshake — no browser, no external service.
- On first connect, Discord shows its **native authorization popup** asking you
  to approve SoundPad Pro (scopes: `rpc`, `identify`, `rpc.voice.write`). The
  `rpc.voice.write` scope is what allows SoundPad Pro to set your mute/deafen
  state.
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

## Voice Actions

Once connected, open the **action assigner** on any pad (right-click a pad, or
Alt-click), pick the **🎙️ Discord** tab, and choose an action:

| Action | What it does |
| --- | --- |
| 🔇 Toggle Mute | Reads your current mute state and flips it |
| 🔇 Mute | Force mute on |
| 🎤 Unmute | Force mute off |
| 🔈 Toggle Deafen | Reads your current deafen state and flips it |
| 🔇 Deafen | Force deafen on |
| 🔊 Undeafen | Force deafen off |
| 🎙️ Push-to-Talk | Unmutes **while the pad is held**, remutes on release |

Mute / unmute / toggle / deafen actions fire on **press**. Push-to-talk is the
one action that uses both edges: it unmutes when you press the pad and remutes
when you let go — hold it exactly as long as you want to talk. A pad with a
Discord action shows a **🎙️ badge**.

Clicking a Discord-mapped pad in the app triggers the action for testing;
push-to-talk registers as a momentary unmute→remute when clicked (hold the real
controller button for a sustained talk).

## Re-authorization for the voice scope

Voice control needs the `rpc.voice.write` OAuth scope. If you authorized SoundPad
Pro **before** this scope existed, your stored token lacks it. The first time you
trigger a mute/deafen/push-to-talk action, Discord rejects the command with a
permissions error and SoundPad Pro **automatically re-opens the authorization
popup** so you can grant the new scope. Approve it once; the refreshed token is
saved and subsequent actions work without prompting.

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
**Scopes**: `rpc`, `identify`, `rpc.voice.write`
**Voice commands**: `SET_VOICE_SETTINGS` / `GET_VOICE_SETTINGS` (opcode 1 FRAME)
**Storage**: `electron-store` (`discord-client-config`, `discord-rpc-auth`)

## Privacy & Security

- Credentials and tokens are stored locally on your machine only
- The client secret never leaves the main process
- The connection is entirely local (named pipe to your own Discord client)
- No data is sent to external servers beyond Discord's own OAuth token endpoint

## Not Yet Implemented

The following is planned for a later story and is intentionally not wired up yet:

- Rich Presence / activity (`SET_ACTIVITY`)

---

**Connected and ready.** 🎮
