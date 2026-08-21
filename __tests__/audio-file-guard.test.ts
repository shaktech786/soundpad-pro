import { describe, test, expect } from 'vitest'
import path from 'path'

// Pure module — no 'electron' import, so it can be required directly
// without mocking app.getPath(). See main/audio-file-guard.js for why this
// exists: read-audio-file and fs:listDirectory used to accept any
// renderer-supplied path with no allowlist, traversal check, or extension
// check (PRE-466).
const {
  resolveAllowedRoots,
  isPathAllowed,
  hasSupportedExtension,
  isDriveRoot,
  readAudioFileGuarded,
  listDirectoryGuarded,
  prepareDroppedAudioFileGuarded,
} = require('../main/audio-file-guard')

describe('resolveAllowedRoots', () => {
  test('resolves each root to an absolute, normalized path', () => {
    const result = resolveAllowedRoots(['C:\\Users\\shake\\Music', 'C:\\Users\\shake\\Documents'])

    expect(result).toEqual([
      path.resolve('C:\\Users\\shake\\Music'),
      path.resolve('C:\\Users\\shake\\Documents'),
    ])
  })

  test('drops null, undefined, and empty-string entries', () => {
    const result = resolveAllowedRoots(['C:\\Users\\shake\\Music', null, undefined, ''])

    expect(result).toEqual([path.resolve('C:\\Users\\shake\\Music')])
  })

  test('returns an empty array for an empty or missing input', () => {
    expect(resolveAllowedRoots([])).toEqual([])
    expect(resolveAllowedRoots(undefined as any)).toEqual([])
  })
})

describe('isPathAllowed', () => {
  const musicDir = 'C:\\Users\\shake\\Music'
  const documentsDir = 'C:\\Users\\shake\\Documents'
  const allowedRoots = [musicDir, documentsDir]

  test('accepts a file directly inside an allowed root', () => {
    expect(isPathAllowed(path.join(musicDir, 'hello.mp3'), allowedRoots)).toBe(true)
  })

  test('accepts a file nested in a subfolder of an allowed root', () => {
    expect(isPathAllowed(path.join(musicDir, 'board', 'nested', 'hello.mp3'), allowedRoots)).toBe(true)
  })

  test('accepts the allowed root itself', () => {
    expect(isPathAllowed(musicDir, allowedRoots)).toBe(true)
  })

  test('rejects a traversal payload that escapes the allowed root', () => {
    const traversal = path.join(musicDir, '..', '..', 'Windows', 'System32', 'cmd.exe')
    expect(isPathAllowed(traversal, allowedRoots)).toBe(false)
  })

  test('rejects a traversal payload built from raw string concatenation', () => {
    const traversal = `${musicDir}\\..\\..\\Windows\\System32\\cmd.exe`
    expect(isPathAllowed(traversal, allowedRoots)).toBe(false)
  })

  test('rejects a path outside every allowed root', () => {
    expect(isPathAllowed('C:\\Users\\shake\\Desktop\\hello.mp3', allowedRoots)).toBe(false)
    expect(isPathAllowed('C:\\Windows\\System32\\cmd.exe', allowedRoots)).toBe(false)
    expect(isPathAllowed('C:\\Users\\someone-else\\Music\\hello.mp3', allowedRoots)).toBe(false)
  })

  test('does not treat a sibling folder with a matching prefix as inside the root', () => {
    // "C:\Users\shake\Music2" starts with the "C:\Users\shake\Music" string
    // but is not inside it — this only stays correct because isPathAllowed
    // compares with a trailing path separator, not a raw startsWith.
    expect(isPathAllowed('C:\\Users\\shake\\Music2\\hello.mp3', allowedRoots)).toBe(false)
  })

  test('rejects empty, non-string, or missing paths', () => {
    expect(isPathAllowed('', allowedRoots)).toBe(false)
    expect(isPathAllowed(null as any, allowedRoots)).toBe(false)
    expect(isPathAllowed(undefined as any, allowedRoots)).toBe(false)
  })

  test('rejects everything when there are no allowed roots', () => {
    expect(isPathAllowed(path.join(musicDir, 'hello.mp3'), [])).toBe(false)
  })
})

describe('hasSupportedExtension', () => {
  test('accepts every extension in the shared contract', () => {
    const exts = ['mp3', 'wav', 'ogg', 'webm', 'm4a', 'flac', 'aac', 'opus', 'weba']
    for (const ext of exts) {
      expect(hasSupportedExtension(`C:\\Users\\shake\\Music\\hello.${ext}`)).toBe(true)
    }
  })

  test('is case-insensitive', () => {
    expect(hasSupportedExtension('C:\\Users\\shake\\Music\\hello.MP3')).toBe(true)
    expect(hasSupportedExtension('C:\\Users\\shake\\Music\\hello.WAV')).toBe(true)
  })

  test('rejects a bad extension', () => {
    expect(hasSupportedExtension('C:\\Users\\shake\\Music\\hello.exe')).toBe(false)
    expect(hasSupportedExtension('C:\\Users\\shake\\Music\\hello.txt')).toBe(false)
    expect(hasSupportedExtension('C:\\Users\\shake\\Music\\hello.mp4')).toBe(false)
  })

  test('rejects an extension-less or empty path', () => {
    expect(hasSupportedExtension('C:\\Users\\shake\\Music\\hello')).toBe(false)
    expect(hasSupportedExtension('')).toBe(false)
    expect(hasSupportedExtension(null as any)).toBe(false)
  })
})

describe('isDriveRoot', () => {
  test('recognises a Windows drive root', () => {
    expect(isDriveRoot('C:\\')).toBe(true)
    expect(isDriveRoot('D:\\')).toBe(true)
    expect(isDriveRoot('D:/')).toBe(true)
  })

  test('does not treat a folder under a drive root as the root itself', () => {
    expect(isDriveRoot('C:\\Users\\shake\\Music')).toBe(false)
    expect(isDriveRoot('D:\\Sounds')).toBe(false)
  })

  test('rejects empty, non-string, or missing paths', () => {
    expect(isDriveRoot('')).toBe(false)
    expect(isDriveRoot(null as any)).toBe(false)
    expect(isDriveRoot(undefined as any)).toBe(false)
  })
})

// --- readAudioFileGuarded ---
// Orchestrates the full read-audio-file IPC handler's logic with injected
// stat/readFile so it's testable without booting Electron or touching a
// real filesystem. main/index.js's ipcMain.handle('read-audio-file', ...)
// wires this to the real fs.promises.stat / fs.promises.readFile.

const musicDir = 'C:\\Users\\shake\\Music'
const allowedRoots = [musicDir]
const mimeByExtension = { '.mp3': 'audio/mpeg', '.wav': 'audio/wav' }
const maxFileSizeBytes = 50 * 1024 * 1024

describe('readAudioFileGuarded', () => {
  test('returns an error for a path outside the allowlist, without stat-ing or reading it', async () => {
    const stat = () => { throw new Error('should not be called') }
    const readFile = () => { throw new Error('should not be called') }

    const result = await readAudioFileGuarded('C:\\Windows\\System32\\cmd.exe', {
      allowedRoots, maxFileSizeBytes, mimeByExtension, stat, readFile,
    })

    expect('error' in result).toBe(true)
    expect((result as any).error).toMatch(/outside the folders/i)
  })

  test('returns an error for an unsupported extension inside an allowed root, without stat-ing or reading it', async () => {
    const stat = () => { throw new Error('should not be called') }
    const readFile = () => { throw new Error('should not be called') }

    const result = await readAudioFileGuarded(path.join(musicDir, 'notes.txt'), {
      allowedRoots, maxFileSizeBytes, mimeByExtension, stat, readFile,
    })

    expect('error' in result).toBe(true)
    expect((result as any).error).toMatch(/unsupported/i)
  })

  test('returns an error for a file over the size cap, stat-ing before ever calling readFile', async () => {
    let readFileCalled = false
    const stat = async () => ({ size: maxFileSizeBytes + 1 })
    const readFile = async () => { readFileCalled = true; return Buffer.from('') }

    const result = await readAudioFileGuarded(path.join(musicDir, 'huge.mp3'), {
      allowedRoots, maxFileSizeBytes, mimeByExtension, stat, readFile,
    })

    expect('error' in result).toBe(true)
    expect((result as any).error).toMatch(/too large/i)
    expect(readFileCalled).toBe(false)
  })

  test('returns a friendly "File not found" error when stat rejects with ENOENT', async () => {
    const stat = async () => { const err: any = new Error('ENOENT'); err.code = 'ENOENT'; throw err }
    const readFile = async () => Buffer.from('')

    const result = await readAudioFileGuarded(path.join(musicDir, 'missing.mp3'), {
      allowedRoots, maxFileSizeBytes, mimeByExtension, stat, readFile,
    })

    expect((result as any).error).toMatch(/file not found/i)
  })

  test('returns buffer, mimeType, and fileName for a valid in-allowlist file under the size cap', async () => {
    const stat = async () => ({ size: 1024 })
    const readFile = async () => Buffer.from('fake-audio-bytes')

    const result = await readAudioFileGuarded(path.join(musicDir, 'hello.mp3'), {
      allowedRoots, maxFileSizeBytes, mimeByExtension, stat, readFile,
    })

    expect('error' in result).toBe(false)
    expect(Buffer.isBuffer((result as any).buffer)).toBe(true)
    expect((result as any).buffer.toString()).toBe('fake-audio-bytes')
    expect((result as any).mimeType).toBe('audio/mpeg')
    expect((result as any).fileName).toBe('hello.mp3')
  })

  test('falls back to audio/mpeg when the extension has no MIME mapping (should not happen post-extension-check, but stays safe)', async () => {
    const stat = async () => ({ size: 1024 })
    const readFile = async () => Buffer.from('x')

    const result = await readAudioFileGuarded(path.join(musicDir, 'hello.wav'), {
      allowedRoots, maxFileSizeBytes, mimeByExtension: {}, stat, readFile,
    })

    expect((result as any).mimeType).toBe('audio/mpeg')
  })
})

// --- listDirectoryGuarded ---

describe('listDirectoryGuarded', () => {
  function fakeDirEntry(name: string, isDir: boolean) {
    return { name, isDirectory: () => isDir, isFile: () => !isDir }
  }

  test('returns an error for a directory outside the allowlist, without calling readdir', async () => {
    let readdirCalled = false
    const readdir = async () => { readdirCalled = true; return [] }

    const result = await listDirectoryGuarded('C:\\Windows\\System32', {
      allowedRoots, audioExtensions: ['.mp3'], maxEntries: 10, readdir,
    })

    expect(result.error).toMatch(/outside the folders/i)
    expect(result.entries).toEqual([])
    expect(readdirCalled).toBe(false)
  })

  test('lists subdirectories and supported audio files, sorted dirs-first then alphabetically', async () => {
    const readdir = async () => [
      fakeDirEntry('zebra.mp3', false),
      fakeDirEntry('Board B', true),
      fakeDirEntry('apple.mp3', false),
      fakeDirEntry('Board A', true),
      fakeDirEntry('ignored.txt', false),
      fakeDirEntry('.hidden', true),
    ]

    const result = await listDirectoryGuarded(musicDir, {
      allowedRoots, audioExtensions: ['.mp3'], maxEntries: 100, readdir,
    })

    expect(result.error).toBeNull()
    expect(result.entries.map((e) => e.name)).toEqual(['Board A', 'Board B', 'apple.mp3', 'zebra.mp3'])
    expect(result.entries.every((e) => !e.name.startsWith('.'))).toBe(true)
    expect(result.truncated).toBe(false)
    expect(result.totalCount).toBe(4)
  })

  test('caps entries at maxEntries and reports truncated + the real totalCount', async () => {
    const readdir = async () => Array.from({ length: 10 }, (_, i) => fakeDirEntry(`sound${i}.mp3`, false))

    const result = await listDirectoryGuarded(musicDir, {
      allowedRoots, audioExtensions: ['.mp3'], maxEntries: 3, readdir,
    })

    expect(result.entries.length).toBe(3)
    expect(result.truncated).toBe(true)
    expect(result.totalCount).toBe(10)
  })

  test('returns an error and empty entries when readdir rejects', async () => {
    const readdir = async () => { throw new Error('EPERM: operation not permitted') }

    const result = await listDirectoryGuarded(musicDir, {
      allowedRoots, audioExtensions: ['.mp3'], maxEntries: 10, readdir,
    })

    expect(result.error).toMatch(/EPERM/)
    expect(result.entries).toEqual([])
    expect(result.truncated).toBe(false)
    expect(result.totalCount).toBe(0)
  })
})

// --- prepareDroppedAudioFileGuarded ---
// Backs main/index.js's fs:prepareDroppedAudioFile IPC handler (PRE-470),
// invoked when a file is dragged from Explorer onto a pad or the picker.
// stat/grantRoot are injected so this is testable without booting Electron.

describe('prepareDroppedAudioFileGuarded', () => {
  test('assigns a supported audio file and grants its containing folder', async () => {
    const stat = async () => ({ isDirectory: () => false })
    let grantedWith: string | null = null
    const grantRoot = (dirPath: string) => { grantedWith = dirPath }

    const result = await prepareDroppedAudioFileGuarded(path.join(musicDir, 'kick.mp3'), { stat, grantRoot })

    expect('error' in result).toBe(false)
    expect((result as any).filePath).toBe(path.join(musicDir, 'kick.mp3'))
    expect((result as any).fileName).toBe('kick.mp3')
    expect(grantedWith).toBe(musicDir)
  })

  test('rejects a dropped folder without granting anything', async () => {
    const stat = async () => ({ isDirectory: () => true })
    let grantCalled = false
    const grantRoot = () => { grantCalled = true }

    const result = await prepareDroppedAudioFileGuarded(path.join(musicDir, 'MySounds'), { stat, grantRoot })

    expect('error' in result).toBe(true)
    expect((result as any).error).toBe('folder')
    expect((result as any).message).toMatch(/folder/i)
    expect(grantCalled).toBe(false)
  })

  test('rejects an unsupported extension without granting anything', async () => {
    const stat = async () => ({ isDirectory: () => false })
    let grantCalled = false
    const grantRoot = () => { grantCalled = true }

    const result = await prepareDroppedAudioFileGuarded(path.join(musicDir, 'notes.txt'), { stat, grantRoot })

    expect('error' in result).toBe(true)
    expect((result as any).error).toBe('unsupported')
    expect(grantCalled).toBe(false)
  })

  test('returns a not-found error when stat rejects, without granting anything', async () => {
    const stat = async () => { throw new Error('ENOENT') }
    let grantCalled = false
    const grantRoot = () => { grantCalled = true }

    const result = await prepareDroppedAudioFileGuarded(path.join(musicDir, 'gone.mp3'), { stat, grantRoot })

    expect('error' in result).toBe(true)
    expect((result as any).error).toBe('not-found')
    expect(grantCalled).toBe(false)
  })

  test('rejects an empty or non-string path without calling stat or granting anything', async () => {
    const stat = () => { throw new Error('should not be called') }
    let grantCalled = false
    const grantRoot = () => { grantCalled = true }

    const result = await prepareDroppedAudioFileGuarded('', { stat, grantRoot })

    expect('error' in result).toBe(true)
    expect((result as any).error).toBe('unsupported')
    expect(grantCalled).toBe(false)
  })
})
