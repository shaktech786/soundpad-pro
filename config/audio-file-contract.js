'use strict';

// The single source of truth for what "a supported audio file" means in
// this app. Before this module existed, the extension list, the MIME map,
// and the size cap were each restated (and drifting — '.weba' was missing
// from at least one copy) across main/index.js, config/constants.ts, and
// utils/audioUtils.ts. Everything else now derives from here instead of
// declaring its own literals.
//
// Plain CommonJS on purpose: main/** is untyped CJS excluded from
// tsconfig.json and reaches this file via require(). config/audio-file-contract.d.ts
// sits next to it so strict-TypeScript importers (config/constants.ts,
// utils/audioUtils.ts, main/audio-file-guard.js's TS-facing callers, etc.)
// get real types — TypeScript's module resolution picks a sibling .d.ts
// over the .js for type info without needing this file inside the ts
// program's `include` globs.

// Leading dot, lowercase — matches what path.extname() returns, so callers
// never have to strip/re-add a dot to compare.
const SUPPORTED_EXTENSIONS = [
  '.mp3', '.wav', '.ogg', '.webm', '.m4a', '.flac', '.aac', '.opus', '.weba',
];

// One canonical MIME type per extension. '.weba' maps to 'audio/webm' —
// there is no distinct registered MIME type for the .weba container, it's
// the same WebM audio container OBS/browsers already use for .webm.
const MIME_BY_EXTENSION = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.webm': 'audio/webm',
  '.m4a': 'audio/mp4',
  '.flac': 'audio/flac',
  '.aac': 'audio/aac',
  '.opus': 'audio/opus',
  '.weba': 'audio/webm',
};

// Declared for years as APP_CONFIG.AUDIO.MAX_FILE_SIZE and never enforced —
// a multi-GB file was buffered whole across IPC. Story 1 enforces this at
// the read-audio-file boundary, stat()-ing before reading so an oversized
// file is never pulled into memory in the first place.
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

// fs:listDirectory is unbounded today against folders that may hold
// thousands of files; the renderer's list is not virtualized. Cap results
// so one bad folder choice can't hang the picker.
const MAX_DIRECTORY_ENTRIES = 2000;

module.exports = {
  SUPPORTED_EXTENSIONS,
  MIME_BY_EXTENSION,
  MAX_FILE_SIZE_BYTES,
  MAX_DIRECTORY_ENTRIES,
};
