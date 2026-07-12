# Auto-Update

SoundPad Pro updates itself from its GitHub Releases using
[`electron-updater`](https://www.electron.build/auto-update). Updates download
silently in the background and are **only ever installed on an explicit user
action** — the app never restarts itself mid-session.

## How it works

- The Windows installer is published as a GitHub Release asset by the manual
  release workflow (see [Publishing releases](#publishing-releases)). Alongside
  the `.exe`, electron-builder emits two metadata files that the updater needs:
  - `latest.yml` — the update feed: current version + file hashes.
  - `SoundPad-Pro-Setup.exe.blockmap` — a chunk map enabling differential
    downloads (only the changed parts of the installer are fetched between
    versions).
- The publish target is configured in `.electron-builder.config.js`:

  ```js
  publish: { provider: "github", owner: "shaktech786", repo: "soundpad-pro" }
  ```

  At build time electron-builder bakes an `app-update.yml` into the package so
  the runtime knows which repo to poll.
- On the main process (`main/auto-updater.js`, wired up in `main/index.js`):
  - **On launch**, ~5 seconds after startup (so it never blocks the window from
    opening), the app calls `autoUpdater.checkForUpdates()`.
  - **Every 4 hours** thereafter it re-checks, for long-running streaming
    sessions that stay open for days. The interval is torn down on
    `window-all-closed` alongside the other polling services.
  - `autoDownload = true`, so if an update is found it downloads in the
    background with no prompt.
  - When the download finishes (`update-downloaded`), the main process pushes an
    `app:update-status` message to the renderer. It does **not** install.
- In the renderer (`pages/index.tsx`), a small green **"Update ready — Restart
  to install"** badge appears in the header only once an update has fully
  downloaded. There is deliberately **no UI while checking or downloading** —
  silence is correct there. Clicking the badge calls `quitAndInstall()`, which
  quits the app and relaunches into the installer.

## Never interrupts a live session

This is a live soundboard used *during* broadcasts. A surprise relaunch would
drop the stream's audio, so applying an update is always user-gated. This is
enforced in code by two deliberate choices in `main/auto-updater.js`:

1. The `update-downloaded` handler **only notifies the renderer** — it never
   calls `quitAndInstall()`. (There is a comment at that handler saying exactly
   this, so it doesn't get "helpfully" changed later.)
2. `autoInstallOnAppQuit = true` — a downloaded update installs the next time
   **the user themselves quits** the app. That is never mid-session, so it's a
   safe, convenient path for users who don't click the badge.

The only two ways an update is ever applied:

- The user clicks **"Restart to install"** (immediate, explicit), or
- The user quits SoundPad Pro on their own (deferred, still user-initiated).

## Publishing releases

Unchanged from before this feature. Releases are cut by the manual
`workflow_dispatch` GitHub Actions workflow (`.github/workflows/release.yml`):

1. Trigger the **Release** workflow from the Actions tab (optionally choosing the
   version bump; `auto` reads commit messages).
2. It bumps the version, builds the Next.js renderer and the Electron NSIS
   installer with `--publish never`, commits the version bump, and creates a
   GitHub Release.
3. It uploads `SoundPad-Pro-Setup.exe`, `SoundPad-Pro-Setup.exe.blockmap`, and
   `latest.yml` as release assets. All three are required for auto-update to
   work — `electron-updater` reads `latest.yml` from the release to decide
   whether an update is available.

Installed clients pick up the new release on their next launch or 4-hour check.

## ⚠️ Known limitation — unsigned builds, relaxed signature verification

**SoundPad Pro is not currently signed with a real code-signing certificate.**
Local builds use a meaningless self-signed certificate (issuer == subject, no CA
chain); CI does not sign at all.

Because there is no genuine Authenticode publisher identity to verify against,
update signature verification is **relaxed** in `.electron-builder.config.js`:

```js
win: { verifyUpdateCodeSignature: false }
```

There is a prominent warning comment directly above that line pointing back to
this section.

**What this means:** the integrity of an update currently rests on **GitHub
account/repo security + HTTPS transport** (the update feed and installer are
fetched over TLS from this repo's Releases), **not** on cryptographic signature
verification of the installer. If the GitHub account or repository were
compromised, a malicious installer could be served and the updater would not
reject it on signature grounds.

**This was an explicit, informed, temporary decision** to ship auto-update now
rather than block it on certificate procurement. It should be revisited once a
real code-signing certificate is obtained:

1. Configure signing (`CSC_LINK` / `CSC_KEY_PASSWORD` locally, and the
   equivalent secrets in CI) so builds carry a real Authenticode signature.
2. Remove the `verifyUpdateCodeSignature: false` line (or set it back to `true`)
   so `electron-updater` verifies the publisher signature before applying an
   update.
3. Delete this limitation section / the warning comment.
