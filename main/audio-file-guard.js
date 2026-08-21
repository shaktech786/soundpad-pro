'use strict';

// Pure, dependency-free path/extension guard for the audio-file IPC
// boundary (`read-audio-file`, `fs:listDirectory`, and the grants recorded
// from `dialog:openDirectory` / `dialog:openFile`). Kept free of `electron`
// so it can be unit-tested directly without booting a window — see
// __tests__/audio-file-guard.test.ts.
//
// main/index.js owns computing the actual allowed-roots list (Music,
// Documents, Downloads, Desktop via app.getPath(), the pinned library
// folder, and any user-granted folders read from the electron-store) and
// calls into these functions to decide. Before this existed, read-audio-file
// and fs:listDirectory accepted any renderer-supplied path with no
// allowlist, traversal check, or size cap — see pages/api/audio/[...path].ts
// for the one file-serving path in this app that already had one.

const path = require('path');
const { SUPPORTED_EXTENSIONS } = require('../config/audio-file-contract');

/**
 * Resolves every candidate root to an absolute, normalized path and drops
 * anything empty/nullish. Running each candidate through path.resolve()
 * (rather than a raw string) is what makes isPathAllowed's comparison safe —
 * both sides are normalized the same way before they're compared.
 * @param {Array<string | null | undefined>} roots
 * @returns {string[]}
 */
function resolveAllowedRoots(roots) {
  return (roots || [])
    .filter((root) => typeof root === 'string' && root.length > 0)
    .map((root) => path.resolve(root));
}

/**
 * True when `targetPath` resolves to a location inside (or exactly equal
 * to) one of `allowedRoots`. Both sides are run through path.resolve()
 * first, so a traversal payload like `<musicDir>/../../Windows/System32/x`
 * collapses to its real location before comparison — it cannot pass just
 * because its raw, unresolved string starts with an allowed prefix.
 * @param {unknown} targetPath
 * @param {Array<string | null | undefined>} allowedRoots
 * @returns {boolean}
 */
function isPathAllowed(targetPath, allowedRoots) {
  if (typeof targetPath !== 'string' || targetPath.length === 0) return false;

  const resolvedTarget = path.resolve(targetPath);
  const resolvedRoots = resolveAllowedRoots(allowedRoots);

  return resolvedRoots.some((root) => {
    if (resolvedTarget === root) return true;
    return resolvedTarget.startsWith(root + path.sep);
  });
}

/**
 * True when `filePath`'s extension (case-insensitive, dot included) is one
 * of config/audio-file-contract.js's SUPPORTED_EXTENSIONS.
 * @param {unknown} filePath
 * @returns {boolean}
 */
function hasSupportedExtension(filePath) {
  if (typeof filePath !== 'string' || filePath.length === 0) return false;
  const ext = path.extname(filePath).toLowerCase();
  return SUPPORTED_EXTENSIONS.includes(ext);
}

/**
 * True when `dirPath` resolves to a filesystem root ("C:\\", "D:\\", "/").
 * The allowlist explicitly blocks drive roots even when a user explicitly
 * picks one via dialog:openDirectory/openFile — see main/index.js's grant
 * logic, which uses this to avoid ever persisting a drive root as a granted
 * root.
 * @param {unknown} dirPath
 * @returns {boolean}
 */
function isDriveRoot(dirPath) {
  if (typeof dirPath !== 'string' || dirPath.length === 0) return false;
  const resolved = path.resolve(dirPath);
  return path.parse(resolved).root === resolved;
}

/**
 * Orchestrates the full read-audio-file guard: allowlist check, supported-
 * extension check, then a stat-before-read size check so an oversized file
 * is never buffered into memory, then the actual read. `stat`/`readFile` are
 * injected (rather than requiring 'fs' directly) so this stays framework-free
 * and unit-testable with fakes — main/index.js's ipcMain handler passes the
 * real fs.promises.stat / fs.promises.readFile.
 * @param {unknown} filePath
 * @param {{
 *   allowedRoots: Array<string | null | undefined>,
 *   maxFileSizeBytes: number,
 *   mimeByExtension: Record<string, string>,
 *   stat: (p: string) => Promise<{ size: number }>,
 *   readFile: (p: string) => Promise<Buffer>,
 * }} deps
 * @returns {Promise<{ buffer: Buffer, mimeType: string, fileName: string } | { error: string }>}
 */
async function readAudioFileGuarded(filePath, deps) {
  const { allowedRoots, maxFileSizeBytes, mimeByExtension, stat, readFile } = deps;

  if (!isPathAllowed(filePath, allowedRoots)) {
    return {
      error: 'This file is outside the folders Prelive Deck can read. Pick it again from Music, Documents, Downloads, Desktop, or your pinned library folder.',
    };
  }
  if (!hasSupportedExtension(filePath)) {
    return { error: 'Unsupported audio file type.' };
  }

  let stats;
  try {
    stats = await stat(filePath);
  } catch (statError) {
    return { error: statError && statError.code === 'ENOENT' ? 'File not found.' : (statError && statError.message) || 'Failed to read file.' };
  }

  if (stats.size > maxFileSizeBytes) {
    const maxMb = Math.round(maxFileSizeBytes / (1024 * 1024));
    return { error: `File is too large to load (max ${maxMb}MB).` };
  }

  try {
    const buffer = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mimeType = mimeByExtension[ext] || 'audio/mpeg';
    return { buffer, mimeType, fileName: path.basename(filePath) };
  } catch (readError) {
    console.error('Error reading audio file:', readError);
    return { error: (readError && readError.message) || 'Failed to read file.' };
  }
}

/**
 * Orchestrates the full fs:listDirectory guard: allowlist check, then reads
 * and filters entries (subdirectories plus files with a supported
 * extension, dotfiles excluded), sorted dirs-first, capped at `maxEntries`.
 * `readdir` is injected so this stays framework-free and unit-testable —
 * main/index.js's ipcMain handler passes the real fs.promises.readdir.
 * @param {unknown} dirPath
 * @param {{
 *   allowedRoots: Array<string | null | undefined>,
 *   audioExtensions: string[],
 *   maxEntries: number,
 *   readdir: (p: string, opts: { withFileTypes: true }) => Promise<Array<{ name: string, isDirectory(): boolean, isFile(): boolean }>>,
 * }} deps
 * @returns {Promise<{
 *   entries: { name: string, path: string, isDir: boolean }[],
 *   error: string | null,
 *   truncated: boolean,
 *   totalCount: number,
 * }>}
 */
async function listDirectoryGuarded(dirPath, deps) {
  const { allowedRoots, audioExtensions, maxEntries, readdir } = deps;

  if (!isPathAllowed(dirPath, allowedRoots)) {
    return {
      entries: [],
      error: 'This folder is outside the folders Prelive Deck can browse. Pick it again from Music, Documents, Downloads, Desktop, or your pinned library folder.',
      truncated: false,
      totalCount: 0,
    };
  }

  try {
    const rawEntries = await readdir(dirPath, { withFileTypes: true });
    const extSet = new Set(audioExtensions);
    const result = [];
    for (const entry of rawEntries) {
      if (entry.name.startsWith('.')) continue;
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        result.push({ name: entry.name, path: fullPath, isDir: true });
      } else if (entry.isFile() && extSet.has(path.extname(entry.name).toLowerCase())) {
        result.push({ name: entry.name, path: fullPath, isDir: false });
      }
    }
    result.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });

    const totalCount = result.length;
    const truncated = totalCount > maxEntries;
    const entries = truncated ? result.slice(0, maxEntries) : result;
    return { entries, error: null, truncated, totalCount };
  } catch (err) {
    return { entries: [], error: err.message, truncated: false, totalCount: 0 };
  }
}

module.exports = {
  resolveAllowedRoots,
  isPathAllowed,
  hasSupportedExtension,
  isDriveRoot,
  readAudioFileGuarded,
  listDirectoryGuarded,
};
