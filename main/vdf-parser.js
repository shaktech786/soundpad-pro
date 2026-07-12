// Minimal, dependency-free VDF / KeyValues parser.
//
// Valve's VDF (a.k.a. KeyValues) is the format used by Steam's
// `libraryfolders.vdf` and `appmanifest_*.acf` files. It's a simple nested
// grammar:
//
//   "key"   "value"
//   "key"   { "nested" "value" ... }
//
// plus `//` line comments and optional (rare) unquoted tokens. We hand-roll a
// small tokenizer + recursive parser rather than pull in an npm package, so we
// add ZERO new runtime dependencies (no native/compiled code, no ESM/asar
// packaging risk — see docs/audio-routing-architecture.md for why that risk is
// avoided here).
//
// Returns a plain nested object. Duplicate sibling keys keep the LAST value,
// which matches how Steam reads its own files. Parsing never throws on
// structural quirks it can recover from; genuinely broken input throws so the
// caller can skip that one file and continue.

function tokenize(input) {
  const tokens = [];
  const len = input.length;
  let i = 0;

  while (i < len) {
    const ch = input[i];

    // Whitespace
    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
      i++;
      continue;
    }

    // Line comment: // ... to end of line
    if (ch === '/' && input[i + 1] === '/') {
      while (i < len && input[i] !== '\n') i++;
      continue;
    }

    // Braces
    if (ch === '{' || ch === '}') {
      tokens.push({ type: ch });
      i++;
      continue;
    }

    // Quoted string. VDF supports backslash escapes (\\ \" \t \n).
    if (ch === '"') {
      i++;
      let value = '';
      while (i < len && input[i] !== '"') {
        if (input[i] === '\\' && i + 1 < len) {
          const next = input[i + 1];
          if (next === 'n') value += '\n';
          else if (next === 't') value += '\t';
          else value += next; // covers \\ and \"
          i += 2;
          continue;
        }
        value += input[i];
        i++;
      }
      if (i >= len) throw new Error('Unterminated quoted string in VDF input');
      i++; // closing quote
      tokens.push({ type: 'string', value });
      continue;
    }

    // Unquoted token: read until whitespace or brace. Steam files rarely use
    // these, but tolerate them for robustness across client versions.
    let value = '';
    while (
      i < len &&
      input[i] !== ' ' &&
      input[i] !== '\t' &&
      input[i] !== '\r' &&
      input[i] !== '\n' &&
      input[i] !== '{' &&
      input[i] !== '}'
    ) {
      value += input[i];
      i++;
    }
    tokens.push({ type: 'string', value });
  }

  return tokens;
}

// Parse a run of `key value | key { block }` pairs until EOF or a `}`.
function parseObject(tokens, state) {
  const obj = {};

  while (state.pos < tokens.length) {
    const token = tokens[state.pos];

    if (token.type === '}') {
      state.pos++;
      return obj;
    }

    if (token.type !== 'string') {
      throw new Error(`Expected a key string in VDF input, got '${token.type}'`);
    }

    const key = token.value;
    state.pos++;

    const valueToken = tokens[state.pos];
    if (!valueToken) {
      throw new Error(`Missing value for VDF key '${key}'`);
    }

    if (valueToken.type === '{') {
      state.pos++; // consume {
      obj[key] = parseObject(tokens, state);
    } else if (valueToken.type === 'string') {
      obj[key] = valueToken.value;
      state.pos++;
    } else {
      throw new Error(`Unexpected '}' where a value was expected for VDF key '${key}'`);
    }
  }

  return obj;
}

// Parse a VDF/KeyValues string into a nested object.
function parseVdf(input) {
  if (typeof input !== 'string') {
    throw new Error('parseVdf expects a string');
  }
  const tokens = tokenize(input);
  const state = { pos: 0 };
  return parseObject(tokens, state);
}

module.exports = { parseVdf };
