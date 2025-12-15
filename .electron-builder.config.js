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
    "node_modules/howler/**/*"
  ],
  compression: "maximum",
  npmRebuild: false,
  nodeGypRebuild: false,
  buildDependenciesFromSource: false,
  removePackageScripts: true,

  win: {
    target: [
      {
        target: "nsis",
        arch: ["x64"]
      }
    ],
    icon: "icon.ico"
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
    installerHeaderIcon: "icon.ico"
  },

  portable: {
    artifactName: "${productName}-Portable-${version}.${ext}"
  }
};