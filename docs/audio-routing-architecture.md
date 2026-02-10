# Audio Routing Architecture

How SoundPad Pro routes audio to VoiceMeeter Banana for streaming. Documents every approach tried and what finally worked after a month of iteration.

---

## Goal

Route SoundPad Pro's audio into VoiceMeeter Banana's virtual input so it appears in both:
- **A1 (headphones)** - so the user hears the sound
- **B1 (stream mix)** - so it goes to OBS/Discord as mic audio alongside the real microphone

## The Problem

Electron 27 / Chromium 118 on Windows has **completely broken `setSinkId()`**. Both `AudioContext.setSinkId()` and `HTMLMediaElement.setSinkId()` accept calls without error but silently fail to route audio to the specified device. This means you cannot programmatically choose an audio output device from the renderer process.

---

## Approaches That Failed

### 1. `setSinkId()` on HTMLMediaElement
**Result:** Silently ignored. Audio plays through default device only.

### 2. `AudioContext` constructor with `{ sinkId: deviceId }`
**Result:** Same as above. Chromium 118 accepts the option but doesn't route.

### 3. MediaStream bridge (AudioContext -> MediaStreamDestination -> Audio element with setSinkId)
**Result:** Still broken. The setSinkId on the bridge Audio element is ignored.

### 4. naudiodon (PortAudio) with WASAPI
**Result:** WASAPI **hangs** on VoiceMeeter virtual devices. The AudioIO constructor never returns. The process deadlocks.

### 5. naudiodon (PortAudio) with WDM-KS
**Result:** Also fails on VoiceMeeter virtual devices.

### 6. naudiodon (PortAudio) with MME
**Result:** Partially worked for VoiceMeeter AUX Input, BUT:
- Must use device's native sample rate (44100Hz for MME). Forcing 48kHz causes `stream.write()` to silently hang (no drain events).
- VoiceMeeter AUX **WDM input** does NOT receive audio from standard Windows apps - only ASIO works for the AUX strip.
- MME could only reach VAIO (Strip[3]), not AUX (Strip[4]).

### 7. naudiodon with ASIO
**Result:** naudiodon's prebuilt `portaudio_x64.dll` only includes MME, WASAPI, and WDM-KS. **No ASIO support compiled in.**

### 8. `audio-decode` ESM module in packaged Electron
**Result:** Works in development but fails in production. The `audio-decode` package and all its dependencies (`mpg123-decoder`, `@wasm-audio-decoders/*`) are ESM-only (`"type": "module"`). Dynamic `import()` from inside Electron's `.asar` archive cannot resolve ESM packages. Error: `Cannot find package 'audio-decode'`.

---

## What Finally Worked

### audify (RtAudio) with ASIO + renderer-side Web Audio API decode

**Three key pieces:**

#### 1. audify for ASIO output
[audify](https://www.npmjs.com/package/audify) provides RtAudio bindings with native **ASIO support** on Windows. Unlike naudiodon/PortAudio, audify's RtAudio build includes ASIO.

```
SoundPad Pro -> audify (RtAudio ASIO) -> VoiceMeeter AUX Virtual ASIO -> Strip[4] -> A1 + B1
```

- Target device: VoiceMeeter AUX Virtual ASIO (device index 1)
- Sample rate: 48000Hz
- Channels: 2 (stereo)
- Buffer: 512 frames (~10.7ms) - determined by ASIO driver
- Mix loop runs on interval, writes interleaved Float32 PCM via `rtAudio.write()`

#### 2. Built-in WAV decoder in main process
For WAV files (most common for soundboards), a custom decoder in `asio-audio-engine.js` handles PCM 8/16/24/32-bit and float32 formats directly. No external dependencies needed. This runs in the main process and handles pre-loading on startup.

#### 3. Renderer-side Web Audio API decode for MP3/OGG/FLAC
For non-WAV formats, the **renderer process** decodes the audio using Chromium's built-in `AudioContext.decodeAudioData()`. This handles every format Chromium supports (MP3, OGG, FLAC, AAC, etc.) without any npm dependencies. The decoded PCM Float32Array data is sent to the main process via IPC and cached in the engine.

```
Renderer: readAudioFile(path) -> buffer
Renderer: AudioContext.decodeAudioData(buffer) -> Float32Array channels
Renderer: asioCachePcm(path, { channels, sampleRate, length }) -> IPC to main
Main:     asioEngine.cachePcm() -> resample to 48kHz -> store in _soundCache
```

### Why this works when nothing else did

1. **ASIO bypasses Windows audio stack entirely** - no WDM/WASAPI/MME limitations, no setSinkId needed
2. **VoiceMeeter AUX Virtual ASIO accepts ASIO input** - unlike WDM/MME which can only reach VAIO
3. **Web Audio API in Chromium decodes everything** - no ESM/asar packaging issues since it's a browser API
4. **audify includes ASIO in its RtAudio build** - naudiodon/PortAudio did not

---

## Architecture Diagram

```
                     RENDERER PROCESS                    MAIN PROCESS
                    +-----------------+                 +------------------+
                    |                 |                  |                  |
  Button Click ---->| useAudioEngine  |                  | AsioAudioEngine  |
                    |   playSound()   |                  |                  |
                    |                 |   IPC             |   _soundCache    |
                    |  [ASIO path]  ----asioPlaySound---->|   playSound()    |
                    |                 |                  |   _activeVoices  |
                    |  [Load path]   |                  |   mix loop       |
                    |   WAV: --------asioLoadSound------>|   _decodeWav()   |
                    |   MP3: decode   |                  |                  |
                    |    locally via   |   IPC            |                  |
                    |    Web Audio   ----asioCachePcm--->|   cachePcm()     |
                    |    API          |                  |   _resample()    |
                    |                 |                  |                  |
                    +-----------------+                  +--------+---------+
                                                                  |
                                                          audify RtAudio
                                                          ASIO write()
                                                                  |
                                                                  v
                                                     VoiceMeeter AUX Virtual ASIO
                                                          Strip[4]
                                                           /    \
                                                          v      v
                                                    A1 (MOTU)  B1 (Stream)
                                                    Headphones  OBS/Discord
```

---

## VoiceMeeter Banana Strip/Bus Mapping

| Strip | Device | Role |
|-------|--------|------|
| Strip[0] | Hardware In 1 (MOTU In 1-2) | Microphone |
| Strip[1] | Hardware In 2 (Razer Ripsaw) | Unused, muted |
| Strip[2] | Hardware In 3 (CABLE Output) | WDM mode fallback |
| Strip[3] | Virtual Input VAIO | General PC audio |
| Strip[4] | Virtual Input AUX | **SoundPad Pro (ASIO)** |

| Bus | Output | Routing |
|-----|--------|---------|
| A1 | MOTU Out 1-2 | Headphones |
| A2 | MOTU Out 3-4 | - |
| A3 | CABLE Input | - |
| B1 | Virtual Output | Stream mix (OBS mic input) |
| B2 | Virtual Output 2 | - |

**B1 composition:** Mic (Strip[0]) + SoundPad Pro (Strip[4]) = game mic / OBS mic

---

## Key Technical Details

### ASIO Buffer Size Discovery
The ASIO driver determines buffer size, not the application. The engine probes by attempting writes of 128, 256, 512, 1024, 2048, and 4096 frames. The first successful write reveals the driver's buffer size (512 frames on this system).

### Queue Management
- Only write to ASIO when `_activeVoices.size > 0` (don't write silence when idle)
- Call `clearOutputQueue()` before starting new playback when transitioning from idle
- This prevents latency buildup from queued silence buffers

### Resampling
If source audio sample rate differs from engine rate (48kHz), linear interpolation resampling is applied. Mono files are duplicated to stereo.

### Auto-initialization
The ASIO engine auto-initializes on app startup (`autoInitDirectAudio()` in main/index.js) and pre-loads all mapped WAV sounds from the electron-store. This ensures instant playback when buttons are pressed - no initialization delay.

### Build Requirements
- CMake must be in PATH for audify native compilation
- `electron-rebuild -f -w audify` for Electron ABI compatibility
- audify added to `asarUnpack` in electron-builder config (native .node module)

---

## Dual Mode Operation

Users can switch between WDM and Direct mode in the sidebar:

| | WDM Mode | Direct (ASIO) Mode |
|---|---|---|
| Engine | Howler.js (Web Audio API) | audify (RtAudio ASIO) |
| Output | Default Windows audio device | VoiceMeeter AUX Virtual ASIO |
| Routing | Windows Volume Mixer per-app | Direct ASIO |
| Formats | All (Chromium handles) | All (WAV native + Web Audio fallback) |
| Latency | Higher (~50ms+) | Low (~10.7ms buffer) |
| Stream routing | Requires per-app audio routing in Windows | Automatic via VoiceMeeter |
