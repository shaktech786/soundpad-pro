module.exports = {
  productName: "Prelive Deck",
  appId: "com.soundpadpro.app",
  directories: {
    output: "dist",
    buildResources: "build"
  },
  files: [
    "main/**/*",
    "out/**/*",
    "package.json",
    "!**/{test,tests,docs,example,examples,.github,.vscode}/**",
    "!**/*.{md,map,ts,tsx,flow}",
    "!**/LICENSE*",
    "!**/README*",
    "!**/CHANGELOG*",
    "!**/.bin/**",
    "!**/.cache/**",
    "!**/tsconfig.json",
    "!node_modules/**/*.d.ts",
    "!node_modules/**/@types/**"
  ],
  asar: {
    smartUnpack: true
  },
  asarUnpack: [
    "node_modules/howler/**/*",
    "node_modules/audify/**/*",
    "node_modules/node-hid/**/*",
    "node_modules/active-win/**/*"
  ],

  // PRE-392: bundle the standalone OBS Setup tool (fetched by
  // scripts/fetch-obs-setup-binary.js into build/obs-setup/ before this config
  // is read — see package.json's build:win / build:win:portable) so the
  // installer can offer to run it (build/installer.nsh's customFinishPage) and
  // the app itself can spawn it later (main/obs-setup-binary-path.js resolves
  // this same "resources/obs-setup" location once packaged).
  extraResources: [
    {
      from: "build/obs-setup",
      to: "obs-setup"
    }
  ],

  compression: "maximum",
  npmRebuild: true,
  nodeGypRebuild: false,
  buildDependenciesFromSource: true,
  removePackageScripts: true,

  // Auto-update feed. electron-builder uses this to (a) emit the `latest.yml`
  // metadata and `.blockmap` that electron-updater reads to detect/download
  // updates, and (b) bake an app-update.yml into the package so the runtime
  // knows where to look. Releases are published by the manual
  // .github/workflows/release.yml workflow. See docs/AUTO_UPDATE.md.
  //
  // Feed lives in shaktech786/prelive-releases, a repo SHARED with the
  // sibling "obs-setup" product (its releases use an `obs-setup-*` tag
  // prefix; ours use `deck-*`). This is deliberately `generic`, not `github`:
  // electron-updater's github provider resolves the update via GitHub's
  // `/repos/{owner}/{repo}/releases/latest` API, which returns the single
  // most-recently-published release for the WHOLE repo — not scoped by tag
  // prefix or product. In a shared repo that means checkForUpdates() would
  // start failing (or resolving the wrong product's release) as soon as an
  // obs-setup release landed more recently than ours. Pointing `generic` at
  // a fixed, non-moving `deck-latest` release side-steps that entirely: it
  // fetches latest.yml from a URL we own and control, with no repo-wide
  // "latest" ambiguity. The release workflow publishes/updates BOTH a
  // versioned `deck-x.y.z` release (changelog, installer for manual
  // download) and this `deck-latest` pointer (same assets, feed target).
  publish: {
    provider: "generic",
    url: "https://github.com/shaktech786/prelive-releases/releases/download/deck-latest/"
  },

  win: {
    target: [
      {
        target: "nsis",
        arch: ["x64"]
      }
    ],
    icon: "icon.ico",

    // ⚠️ TEMPORARY, USER-ACCEPTED LIMITATION — update signature verification is
    // relaxed because Prelive Deck is not yet signed with a real code-signing
    // certificate (local builds use a meaningless self-signed cert; CI does not
    // sign at all). With no genuine Authenticode publisher chain, electron-updater
    // would otherwise refuse to apply the downloaded installer. Setting this to
    // false makes update integrity rest on GitHub account/repo security + HTTPS
    // instead of a cryptographic signature. This was an explicit, informed
    // decision to ship auto-update now; REVISIT and remove this line once a real
    // certificate exists. Full context: docs/AUTO_UPDATE.md ("Known limitation").
    verifyUpdateCodeSignature: false
  },

  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    allowElevation: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    runAfterFinish: true,
    shortcutName: "Prelive Deck",
    uninstallDisplayName: "Prelive Deck",
    artifactName: "Prelive-Deck-Setup.${ext}",
    installerIcon: "icon.ico",
    uninstallerIcon: "icon.ico",
    installerHeaderIcon: "icon.ico",
    // Emit the differential-update blockmap (Prelive-Deck-Setup.exe.blockmap)
    // so electron-updater can download only the changed chunks between versions.
    differentialPackage: true
  },

  portable: {
    artifactName: "Prelive-Deck-Portable-${version}.${ext}"
  }
};