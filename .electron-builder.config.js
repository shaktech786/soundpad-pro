module.exports = {
  productName: "SoundPad Pro",
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
  compression: "maximum",
  npmRebuild: true,
  nodeGypRebuild: false,
  buildDependenciesFromSource: true,
  removePackageScripts: true,

  // Auto-update feed. electron-builder uses this to (a) emit the `latest.yml`
  // metadata and `.blockmap` that electron-updater reads from the GitHub Release
  // to detect/download updates, and (b) bake an app-update.yml into the package
  // so the runtime knows where to look. Releases are published by the manual
  // .github/workflows/release.yml workflow. See docs/AUTO_UPDATE.md.
  publish: {
    provider: "github",
    owner: "shaktech786",
    repo: "soundpad-pro"
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
    // relaxed because SoundPad Pro is not yet signed with a real code-signing
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
    shortcutName: "SoundPad Pro",
    uninstallDisplayName: "SoundPad Pro",
    artifactName: "SoundPad-Pro-Setup.${ext}",
    installerIcon: "icon.ico",
    uninstallerIcon: "icon.ico",
    installerHeaderIcon: "icon.ico",
    // Emit the differential-update blockmap (SoundPad-Pro-Setup.exe.blockmap)
    // so electron-updater can download only the changed chunks between versions.
    differentialPackage: true
  },

  portable: {
    artifactName: "${productName}-Portable-${version}.${ext}"
  }
};