// Shared sound-error helpers used by both the main board (Haute42Layout) and
// the OBS action assigner modal, so a broken pad always reads the same
// friendly text instead of a raw engine/filesystem error string.

/** Turn a raw load-failure message (often a Node ENOENT/EACCES string, or a
 *  Howler decode error) into a short, user-facing explanation. */
export function formatSoundError(error: string): string {
  if (/ENOENT|no such file/i.test(error)) return 'File not found — it may have been moved or deleted.'
  if (/EACCES|permission/i.test(error)) return 'Permission denied — cannot read this file.'
  if (/decode|unsupported|format/i.test(error)) return 'File could not be decoded — it may be corrupt or an unsupported format.'
  return 'Failed to load this file.'
}

/** Map each button's assigned file to its load error (if any), keyed by
 *  button id. `loadErrors` is keyed by file path, not button id, because the
 *  same path can theoretically be assigned to more than one button. */
export function deriveButtonFileErrors(
  soundMappings: Map<number, string>,
  loadErrors: Map<string, string>
): Map<number, string> {
  const errors = new Map<number, string>()
  soundMappings.forEach((filePath, buttonId) => {
    const err = loadErrors.get(filePath)
    if (err) errors.set(buttonId, err)
  })
  return errors
}
