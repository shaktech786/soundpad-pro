# Discord Integration

SoundPad Pro connects to your locally running Discord desktop app over Discord's
RPC protocol. It establishes a **connection and one-time authorization**, then
lets you map controller pads to **mute / deafen / push-to-talk** actions that
change your live Discord voice state.

## How It Works

- SoundPad Pro talks to Discord through the local IPC named pipe
  (`\\?\pipe\discord-ipc-0` … `-9`) using a direct Node implementation of the
  Discord RPC handshake — no browser, no external service.
- The Discord Application is **built in** (a Public Client — no client secret
  ships with the app), so there is no client ID, secret, or redirect URI to
  configure.
- On first connect, Discord shows its **native authorization popup** asking you
  to approve SoundPad Pro (scopes: `rpc`, `identify`, `rpc.voice.write`). The
  `rpc.voice.write` scope is what allows SoundPad Pro to set your mute/deafen
  state.
- The resulting access token is stored locally so future launches reconnect
  **silently** (the token is refreshed automatically when it expires).
- If Discord isn't running, SoundPad Pro retries every 10 seconds in the
  background. It never blocks app startup.

## Setup

SoundPad Pro ships **pre-configured** — there is nothing to paste. It embeds a
Discord Application (a "Public Client", so no client secret is needed) and
handles the OAuth2 exchange for you. All you do is click a button.

1. Make sure the **Discord desktop app is running** and you're signed in
2. Click the **Discord** badge in the header (or open **Settings → Integrations →
   Discord**) and click **Connect to Discord**
3. Discord shows an **Authorize** popup — approve it
4. The badge turns green and shows your Discord account name

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

## Rich Presence (Now Playing)

When connected, SoundPad Pro can show the **currently playing sound** as your
Discord Rich Presence — the "Playing a game / listening to…" status on your
profile.

- The status reads **`Playing <sound name>`** and, when the sound's folder has
  an `attribution.json` entry, a second line with the artist (`by <artist>`) or
  track title.
- The elapsed timer starts when the sound begins.
- The status **clears automatically** when playback stops, so your profile never
  shows a stale "still playing" entry.
- The most recently triggered sound wins if several overlap.

This feature needs only the base `rpc` scope granted at connect — it works even
if you never authorized `rpc.voice.write` for the mute/deafen actions.

### Toggle

In **Settings → Integrations → Discord**, once connected, use
**"Show currently playing sound in Discord status"** to turn Rich Presence on or
off. It's **on by default**. Turning it off clears any active presence
immediately and is independent of the mute/deafen/push-to-talk actions. The
setting is stored locally under `discord-rich-presence-enabled`.

## Connection Status

The **Discord badge** (header and sidebar) reflects live connection state:

| State | Meaning |
| --- | --- |
| Not connected | Idle, or not yet authorized |
| Connecting… | Opening the pipe / handshaking |
| Waiting for authorization… | Approve the popup in Discord |
| Connected | Authorized; account name shown |
| (red) error text | Last failure reason (auto-retries in the background) |

The status updates automatically as Discord starts, stops, or is restarted.

## Where Things Are Stored

The OAuth token is stored locally via `electron-store`:

- `discord-rpc-auth` — access token, refresh token, and expiry

The Client ID is a hardcoded constant in the app (a Public Client, so no secret
exists), and the token never leaves the main process.

## Troubleshooting

### Cannot Connect / "Discord IPC pipe not found"

1. Make sure the **Discord desktop app** is running (the web app in a browser
   does not expose the RPC pipe)
2. Sign in to Discord
3. SoundPad Pro retries every 10 seconds — start Discord and it will connect

### Authorization popup never appears

1. Confirm the Discord desktop app is focused/running
2. Try **Disconnect** then **Connect to Discord** again

### It re-prompts every launch

- This means the token wasn't persisted. Reconnect once and approve the popup;
  the token is saved to `discord-rpc-auth` for subsequent launches.

## Technical Details

**Protocol**: Discord RPC over local IPC named pipe
**Transport**: Node `net` (named pipe) — no native dependency
**Frame format**: `[opcode int32 LE][length int32 LE][UTF-8 JSON]`
**Auth**: OAuth2 authorization-code grant (Public Client — no client_secret) via `https://discord.com/api/oauth2/token`
**Client ID**: hardcoded constant (`DEFAULT_CLIENT_ID` in `main/discord-rpc-client.js`)
**Scopes**: `rpc`, `identify`, `rpc.voice.write`
**Voice commands**: `SET_VOICE_SETTINGS` / `GET_VOICE_SETTINGS` (opcode 1 FRAME)
**Rich Presence**: `SET_ACTIVITY` (opcode 1 FRAME; `activity: null` clears it)
**Storage**: `electron-store` (`discord-rpc-auth`, `discord-rich-presence-enabled`)

## Privacy & Security

- The OAuth token is stored locally on your machine only
- The Client ID is a Public Client identifier (not a secret); no client secret
  ships with the app
- The token never leaves the main process
- The connection is entirely local (named pipe to your own Discord client)
- No data is sent to external servers beyond Discord's own OAuth token endpoint

---

**Connected and ready.** 🎮
