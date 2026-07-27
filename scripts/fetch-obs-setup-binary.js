/**
 * PRE-392: downloads the newest "obs-setup-v*" release's Windows binary from
 * the PUBLIC shaktech786/prelive-releases repo and stages it (plus a
 * version.json record) into build/obs-setup/, so
 * .electron-builder.config.js's `extraResources` can bundle it into the
 * Prelive Deck installer. This gives users ONE install instead of two
 * companion apps: the Deck installer offers to run the bundled tool (see
 * build/installer.nsh's customFinishPage), and the app itself exposes a
 * "Set up my OBS" action (components/OBSSettings.tsx) for anyone who skipped
 * the installer checkbox or reinstalled OBS later.
 *
 * The obs-setup binary is a Bun `--compile` single-file executable built from
 * packages/prelive-cli in the private prelive monorepo (workflow
 * obs-setup-release.yml) — nothing about that build is ported or duplicated
 * here. This script only fetches the already-built artifact.
 *
 * Run before `electron-builder` packages the app (see package.json's
 * build:win / build:win:portable and .github/workflows/release.yml). The
 * source repo is public, so no auth/token is required.
 *
 * FAILS LOUDLY (non-zero exit) on any error — a missing or failed download
 * must never silently ship an installer without the tool, since there is no
 * in-app fallback that can recreate one after the fact.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const RELEASES_REPO = 'shaktech786/prelive-releases';
const TAG_PREFIX = 'obs-setup-v';
const ASSET_NAME = 'prelive-obs-setup-windows-x64.exe';
const OUT_DIR = path.join(__dirname, '..', 'build', 'obs-setup');
const USER_AGENT = 'soundpad-pro-build-script (+https://github.com/shaktech786/soundpad-pro)';
const MAX_REDIRECTS = 5;

function httpsGet(url, headers, redirectsLeft = MAX_REDIRECTS) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          if (redirectsLeft <= 0) {
            reject(new Error(`Too many redirects fetching ${url}`));
            return;
          }
          res.resume();
          resolve(httpsGet(res.headers.location, headers, redirectsLeft - 1));
          return;
        }
        resolve(res);
      })
      .on('error', reject);
  });
}

async function fetchJson(url) {
  const res = await httpsGet(url, { 'User-Agent': USER_AGENT, Accept: 'application/vnd.github+json' });
  const body = await readBody(res);
  if (res.statusCode !== 200) {
    throw new Error(`GitHub API request to ${url} failed: ${res.statusCode} ${res.statusMessage} — ${body.slice(0, 500)}`);
  }
  try {
    return JSON.parse(body);
  } catch (err) {
    throw new Error(`Failed to parse GitHub API response from ${url}: ${err.message}`);
  }
}

function readBody(res) {
  return new Promise((resolve, reject) => {
    let body = '';
    res.on('data', (chunk) => {
      body += chunk;
    });
    res.on('end', () => resolve(body));
    res.on('error', reject);
  });
}

async function downloadToFile(url, destPath) {
  const res = await httpsGet(url, { 'User-Agent': USER_AGENT, Accept: 'application/octet-stream' });
  if (res.statusCode !== 200) {
    const body = await readBody(res);
    throw new Error(`Download of ${url} failed: ${res.statusCode} ${res.statusMessage} — ${body.slice(0, 500)}`);
  }
  await new Promise((resolve, reject) => {
    const fileStream = fs.createWriteStream(destPath);
    res.pipe(fileStream);
    fileStream.on('finish', () => fileStream.close(() => resolve()));
    fileStream.on('error', reject);
    res.on('error', reject);
  });
}

async function findLatestObsSetupRelease() {
  // Deliberately NOT GitHub's /releases/latest endpoint: this repo is SHARED
  // with the Deck installer's own "deck-*" releases (see
  // .electron-builder.config.js's publish comment), so /releases/latest can
  // resolve to whichever product published most recently — not necessarily
  // obs-setup. List releases and pick the newest one tagged obs-setup-v*.
  const releases = await fetchJson(`https://api.github.com/repos/${RELEASES_REPO}/releases?per_page=50`);
  if (!Array.isArray(releases)) {
    throw new Error(`Unexpected GitHub API response listing releases for ${RELEASES_REPO}: ${JSON.stringify(releases).slice(0, 500)}`);
  }

  const candidates = releases
    .filter((r) => r && typeof r.tag_name === 'string' && r.tag_name.startsWith(TAG_PREFIX) && !r.draft)
    .sort((a, b) => new Date(b.published_at || b.created_at) - new Date(a.published_at || a.created_at));

  if (candidates.length === 0) {
    throw new Error(`No "${TAG_PREFIX}*" releases found in ${RELEASES_REPO}. Cannot bundle the OBS Setup tool.`);
  }
  return candidates[0];
}

async function main() {
  console.log(`[fetch-obs-setup-binary] Looking up the newest "${TAG_PREFIX}*" release in ${RELEASES_REPO}...`);
  const release = await findLatestObsSetupRelease();
  const version = release.tag_name.slice(TAG_PREFIX.length);
  console.log(`[fetch-obs-setup-binary] Found ${release.tag_name} (obs-setup v${version})`);

  const asset = (release.assets || []).find((a) => a && a.name === ASSET_NAME);
  if (!asset) {
    const available = (release.assets || []).map((a) => a.name).join(', ') || '(none)';
    throw new Error(
      `Release ${release.tag_name} in ${RELEASES_REPO} has no "${ASSET_NAME}" asset. Available assets: ${available}`
    );
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const destPath = path.join(OUT_DIR, ASSET_NAME);
  console.log(`[fetch-obs-setup-binary] Downloading ${asset.browser_download_url}`);
  console.log(`[fetch-obs-setup-binary]   -> ${destPath}`);
  await downloadToFile(asset.browser_download_url, destPath);

  const stat = fs.statSync(destPath);
  if (!stat.isFile() || stat.size === 0) {
    throw new Error(`Downloaded file at ${destPath} is missing or empty after download.`);
  }
  console.log(`[fetch-obs-setup-binary] Downloaded ${(stat.size / 1024 / 1024).toFixed(1)} MB`);

  const versionInfo = {
    version,
    tag: release.tag_name,
    asset: ASSET_NAME,
    publishedAt: release.published_at || null,
    fetchedAt: new Date().toISOString(),
  };
  const versionFilePath = path.join(OUT_DIR, 'version.json');
  fs.writeFileSync(versionFilePath, JSON.stringify(versionInfo, null, 2) + '\n', 'utf8');
  console.log(`[fetch-obs-setup-binary] Wrote ${versionFilePath}`);

  // Surfaced in release notes by .github/workflows/release.yml.
  console.log(`[fetch-obs-setup-binary] BUNDLED_OBS_SETUP_VERSION=${version}`);
  console.log(`[fetch-obs-setup-binary] Done — bundled OBS Setup v${version}.`);
}

main().catch((err) => {
  console.error('[fetch-obs-setup-binary] FAILED:', err && err.message ? err.message : err);
  console.error('[fetch-obs-setup-binary] Refusing to produce an installer without the OBS Setup tool bundled.');
  process.exitCode = 1;
});
