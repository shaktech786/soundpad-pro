import { describe, test, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'

/**
 * Guards a failure mode CI cannot see: `npm run build:win` packages the app
 * successfully, but the app dies on launch with
 *   "Cannot find module '../config/audio-file-contract'"
 * because electron-builder's `files` allowlist never included it. CI builds the
 * installer and uploads it — it never launches it — so this shipped green.
 *
 * Anything main/ requires from outside main/ must be listed in `files`.
 */

const repoRoot = path.resolve(__dirname, '..')
const mainDir = path.join(repoRoot, 'main')

function outOfMainRequires(): string[] {
  const found = new Set<string>()
  for (const entry of fs.readdirSync(mainDir)) {
    if (!entry.endsWith('.js')) continue
    const src = fs.readFileSync(path.join(mainDir, entry), 'utf8')
    for (const m of src.matchAll(/require\(\s*['"](\.\.\/[^'"]+)['"]\s*\)/g)) {
      // Resolve relative to main/, then make it repo-relative with POSIX separators.
      const abs = path.resolve(mainDir, m[1])
      found.add(path.relative(repoRoot, abs).split(path.sep).join('/'))
    }
  }
  return [...found]
}

function packagedFileGlobs(): string[] {
  // require() the config rather than scraping it with a regex: it is our own
  // side-effect-free CommonJS, and a text scanner trips over apostrophes and
  // quotes inside the comments (which is exactly how the first version of this
  // test managed to fail against a config that was already correct).
  const requireCjs = createRequire(__filename)
  const cfg = requireCjs(path.join(repoRoot, '.electron-builder.config.js'))
  expect(Array.isArray(cfg.files), 'electron-builder config must declare a files array').toBe(true)
  return (cfg.files as string[]).filter(g => !g.startsWith('!'))
}

/** Does an include glob cover this repo-relative path? Handles the `dir/**\/*` form. */
function globCovers(glob: string, target: string): boolean {
  if (glob === target) return true
  const prefix = glob.match(/^(.*?)\/\*\*\/\*$/)
  if (prefix) return target.startsWith(prefix[1] + '/')
  // Extension may be omitted in a require; allow the .js form to satisfy it.
  return glob === `${target}.js`
}

describe('electron-builder files allowlist', () => {
  test('every out-of-main require is packaged', () => {
    const requires = outOfMainRequires()
    // Sanity: if this ever hits zero the regex broke and the test is vacuous.
    expect(requires.length).toBeGreaterThan(0)

    const globs = packagedFileGlobs()
    const missing = requires.filter(r => !globs.some(g => globCovers(g, r)))

    expect(
      missing,
      `main/ requires these from outside main/, but electron-builder will not package them, ` +
      `so the packaged app will throw "Cannot find module" on launch: ${missing.join(', ')}`
    ).toEqual([])
  })

  test('the audio-file contract specifically is packaged', () => {
    // Called out by name because it is the one that actually shipped broken.
    const globs = packagedFileGlobs()
    expect(globs.some(g => globCovers(g, 'config/audio-file-contract'))).toBe(true)
  })
})
