/**
 * Build-time generator for the embedded Discord Client Secret.
 *
 * Discord's RPC AUTHORIZE flow has no PKCE, so exchanging the auth code for a
 * token requires a real client_secret (Confidential Client — see
 * main/discord-rpc-client.js's header). We do NOT want to push that onto the
 * user, and we can't commit it to this public repo. So the release build bakes
 * it in from an environment variable / CI secret (DISCORD_CLIENT_SECRET) into a
 * gitignored `main/discord-secret.js`, which discord-rpc-client.js requires at
 * runtime.
 *
 * Run before electron-builder packages the app (see package.json build:win and
 * .github/workflows/release.yml). If DISCORD_CLIENT_SECRET is unset, it writes an
 * empty secret — the app simply won't connect to Discord until a real build
 * supplies one (dev can also set the env var directly instead of generating).
 */
const fs = require('fs');
const path = require('path');

const secret = (process.env.DISCORD_CLIENT_SECRET || '').trim();
const outPath = path.join(__dirname, '..', 'main', 'discord-secret.js');

const contents =
  '// GENERATED at build time by scripts/generate-discord-secret.js — do NOT commit.\n' +
  '// The value is injected from the DISCORD_CLIENT_SECRET build environment variable.\n' +
  `module.exports = { DISCORD_CLIENT_SECRET: ${JSON.stringify(secret)} };\n`;

fs.writeFileSync(outPath, contents, 'utf8');

if (secret) {
  console.log('[generate-discord-secret] wrote main/discord-secret.js (secret embedded)');
} else {
  console.warn(
    '[generate-discord-secret] DISCORD_CLIENT_SECRET not set — wrote an EMPTY secret. ' +
      'Discord integration will be inert in this build.',
  );
}
