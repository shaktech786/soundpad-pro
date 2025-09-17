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
      },
      {
        target: "portable",
        arch: ["x64"]
      }
    ],
    icon: "icon.ico"
  },

  nsis: {
    oneClick: true,
    perMachine: false,
    allowToChangeInstallationDirectory: false,
    allowElevation: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: "SoundPad Pro",
    uninstallDisplayName: "SoundPad Pro",
    artifactName: "${productName}-Setup-${version}.${ext}",
    warningsAsErrors: false,
    packElevateHelper: false,
    differentialPackage: false,
    unicode: false,
    deleteAppDataOnUninstall: false
  },

  portable: {
    artifactName: "${productName}-Portable-${version}.${ext}"
  }
};