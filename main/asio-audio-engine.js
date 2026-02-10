const fs = require('fs').promises;
const path = require('path');

/**
 * Direct Audio Engine for SoundPad Pro
 *
 * Routes audio directly to VoiceMeeter AUX Input via ASIO using audify (RtAudio).
 * Uses audio-decode for file decoding.
 *
 * Audio path: SoundPad Pro → RtAudio ASIO → VoiceMeeter AUX Virtual ASIO → Strip[4] → A1 + B1
 */

class AsioAudioEngine {
  constructor() {
    this._RtAudio = null;
    this._RtAudioApi = null;
    this._RtAudioFormat = null;
    this._audioDecode = null;

    this._rtAudio = null;
    this._mixInterval = null;
    this._initialized = false;

    this._sampleRate = 48000;
    this._channels = 2;
    this._framesPerBuffer = 1024;

    // Sound cache: filePath -> { pcm: Float32Array[], sampleRate, channels, length }
    this._soundCache = new Map();

    // Active voices: Map<filePath, [{ cursor, volume, loop, id }]>
    this._activeVoices = new Map();
    this._nextVoiceId = 0;

    this._masterVolume = 1.0;

    this._deviceId = null;
    this._deviceName = null;
  }

  /**
   * Get available ASIO output devices.
   */
  getAsioDevices() {
    this._ensureModules();
    const rt = new this._RtAudio(this._RtAudioApi.WINDOWS_ASIO);
    const devices = rt.getDevices();

    return devices
      .map((d, i) => ({ ...d, id: i }))
      .filter(d => d.outputChannels > 0)
      .map(d => ({
        id: d.id,
        name: d.name,
        maxOutputChannels: d.outputChannels,
        defaultSampleRate: d.preferredSampleRate,
        hostAPI: 'ASIO'
      }));
  }

  /**
   * List all output devices (for diagnostics).
   */
  listOutputDevices() {
    this._ensureModules();
    const rt = new this._RtAudio(this._RtAudioApi.WINDOWS_ASIO);
    const devices = rt.getDevices();

    return devices
      .map((d, i) => ({ ...d, id: i }))
      .filter(d => d.outputChannels > 0)
      .map(d => ({
        id: d.id,
        name: d.name,
        hostAPI: 'ASIO',
        maxOutputChannels: d.outputChannels,
        defaultSampleRate: d.preferredSampleRate,
        sampleRates: d.sampleRates
      }));
  }

  /**
   * Auto-detect VoiceMeeter AUX Virtual ASIO device.
   */
  findVoiceMeeterAsio() {
    this._ensureModules();
    const rt = new this._RtAudio(this._RtAudioApi.WINDOWS_ASIO);
    const devices = rt.getDevices();

    console.log('[DirectAudio] Scanning ASIO output devices...');
    devices.forEach((d, i) => {
      if (d.outputChannels > 0) {
        console.log(`  [${i}] "${d.name}" (${d.outputChannels}ch, rates=${d.sampleRates.join(',')}, preferred=${d.preferredSampleRate}Hz)`);
      }
    });

    // Look for VoiceMeeter AUX Virtual ASIO
    const auxIdx = devices.findIndex(d =>
      d.outputChannels > 0 &&
      d.name.toLowerCase().includes('voicemeeter aux')
    );
    if (auxIdx >= 0) {
      const d = devices[auxIdx];
      console.log(`[DirectAudio] Found VoiceMeeter AUX ASIO: id=${auxIdx}`);
      return {
        id: auxIdx,
        name: d.name,
        maxOutputChannels: d.outputChannels,
        defaultSampleRate: d.preferredSampleRate,
        hostAPI: 'ASIO',
        mode: 'asio'
      };
    }

    // Fallback: any VoiceMeeter ASIO device
    const vmIdx = devices.findIndex(d =>
      d.outputChannels > 0 &&
      d.name.toLowerCase().includes('voicemeeter')
    );
    if (vmIdx >= 0) {
      const d = devices[vmIdx];
      console.log(`[DirectAudio] Found VoiceMeeter ASIO (fallback): id=${vmIdx}`);
      return {
        id: vmIdx,
        name: d.name,
        maxOutputChannels: d.outputChannels,
        defaultSampleRate: d.preferredSampleRate,
        hostAPI: 'ASIO',
        mode: 'asio'
      };
    }

    console.log('[DirectAudio] No VoiceMeeter ASIO device found');
    return null;
  }

  /**
   * Initialize ASIO output stream to VoiceMeeter AUX.
   * @param {number} [deviceId] - Specific device ID. If omitted, auto-detects.
   */
  initialize(deviceId) {
    if (this._initialized) {
      return { success: true, device: this._deviceName };
    }

    this._ensureModules();

    let device;
    if (deviceId !== undefined) {
      const rt = new this._RtAudio(this._RtAudioApi.WINDOWS_ASIO);
      const devices = rt.getDevices();
      if (deviceId < 0 || deviceId >= devices.length || devices[deviceId].outputChannels === 0) {
        throw new Error(`ASIO device with id ${deviceId} not found or has no outputs`);
      }
      const d = devices[deviceId];
      device = {
        id: deviceId,
        name: d.name,
        maxOutputChannels: d.outputChannels,
        defaultSampleRate: d.preferredSampleRate,
        mode: 'asio'
      };
    } else {
      device = this.findVoiceMeeterAsio();
      if (!device) {
        throw new Error('VoiceMeeter AUX ASIO device not found. Is VoiceMeeter Banana running?');
      }
    }

    this._deviceId = device.id;
    this._deviceName = device.name;
    this._sampleRate = device.defaultSampleRate || 48000;
    this._channels = 2;

    console.log(`[DirectAudio] Opening ASIO: ${device.name} (id=${device.id}, rate=${this._sampleRate}Hz, ch=${this._channels})`);

    // Create RtAudio instance with ASIO API
    this._rtAudio = new this._RtAudio(this._RtAudioApi.WINDOWS_ASIO);

    // Open output stream — use frameSize 0 to let ASIO driver choose its preferred size
    this._rtAudio.openStream(
      {
        deviceId: this._deviceId,
        nChannels: this._channels,
        firstChannel: 0
      },
      null,  // no input
      this._RtAudioFormat.RTAUDIO_FLOAT32,
      this._sampleRate,
      0,  // let ASIO driver decide buffer size
      'SoundPadPro',
      null,
      null
    );

    this._rtAudio.start();

    // Probe the actual ASIO buffer size by trying writes
    this._framesPerBuffer = this._probeBufferSize();
    console.log(`[DirectAudio] ASIO buffer size: ${this._framesPerBuffer} frames`);

    this._startMixLoop();
    this._initialized = true;

    console.log(`[DirectAudio] ASIO stream started on ${device.name} @ ${this._sampleRate}Hz`);
    return {
      success: true,
      device: device.name,
      sampleRate: this._sampleRate,
      channels: this._channels,
      mode: 'asio'
    };
  }

  /**
   * Load and decode an audio file to PCM cache.
   */
  async loadSound(filePath) {
    if (this._soundCache.has(filePath)) {
      return { success: true, cached: true };
    }

    this._ensureModules();
    await this._ensureAudioDecode();

    try {
      const fileBuffer = await fs.readFile(filePath);
      const audioBuffer = await this._audioDecode(fileBuffer);

      const srcRate = audioBuffer.sampleRate;
      const srcChannels = audioBuffer.numberOfChannels;

      const channelData = [];
      for (let ch = 0; ch < srcChannels; ch++) {
        channelData.push(new Float32Array(audioBuffer.getChannelData(ch)));
      }

      let pcmData;
      if (srcRate !== this._sampleRate) {
        pcmData = this._resampleChannels(channelData, srcRate, this._sampleRate);
      } else {
        pcmData = channelData;
      }

      // If mono, duplicate to stereo
      if (pcmData.length === 1) {
        pcmData = [pcmData[0], new Float32Array(pcmData[0])];
      }

      this._soundCache.set(filePath, {
        pcm: pcmData,
        sampleRate: this._sampleRate,
        channels: pcmData.length,
        length: pcmData[0].length
      });

      return { success: true, cached: false, samples: pcmData[0].length, duration: pcmData[0].length / this._sampleRate };
    } catch (err) {
      console.error(`[DirectAudio] Failed to load ${filePath}:`, err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Cache pre-decoded PCM data from the renderer process.
   * Handles resampling and mono-to-stereo conversion.
   */
  cachePcm(filePath, { channels, sampleRate, length }) {
    if (this._soundCache.has(filePath)) {
      return { success: true, cached: true };
    }

    let pcmData = channels.map(ch => new Float32Array(ch));

    if (sampleRate !== this._sampleRate) {
      pcmData = this._resampleChannels(pcmData, sampleRate, this._sampleRate);
    }

    if (pcmData.length === 1) {
      pcmData = [pcmData[0], new Float32Array(pcmData[0])];
    }

    this._soundCache.set(filePath, {
      pcm: pcmData,
      sampleRate: this._sampleRate,
      channels: pcmData.length,
      length: pcmData[0].length
    });

    return { success: true, cached: false, samples: pcmData[0].length, duration: pcmData[0].length / this._sampleRate };
  }

  unloadSound(filePath) {
    this._soundCache.delete(filePath);
    this._activeVoices.delete(filePath);
    return { success: true };
  }

  playSound(filePath, options = {}) {
    const cached = this._soundCache.get(filePath);
    if (!cached) {
      console.warn(`[DirectAudio] Sound not cached: ${filePath}`);
      return { success: false, error: 'Sound not loaded' };
    }

    const volume = options.volume !== undefined ? options.volume : 1.0;
    const loop = options.loop || false;
    const restart = options.restart || false;

    // Flush queued silence so new audio plays immediately
    if (this._activeVoices.size === 0 && this._rtAudio) {
      try { this._rtAudio.clearOutputQueue(); } catch (e) { /* ignore */ }
    }

    if (restart) {
      this._activeVoices.delete(filePath);
    }

    const voiceId = this._nextVoiceId++;
    const voice = { cursor: 0, volume, loop, id: voiceId };

    if (!this._activeVoices.has(filePath)) {
      this._activeVoices.set(filePath, []);
    }
    this._activeVoices.get(filePath).push(voice);

    return { success: true, voiceId };
  }

  stopSound(filePath) {
    this._activeVoices.delete(filePath);
    return { success: true };
  }

  stopAll() {
    this._activeVoices.clear();
    return { success: true };
  }

  setVolume(filePath, volume) {
    const voices = this._activeVoices.get(filePath);
    if (voices) {
      for (const voice of voices) {
        voice.volume = Math.max(0, Math.min(1, volume));
      }
    }
    return { success: true };
  }

  setMasterVolume(volume) {
    this._masterVolume = Math.max(0, Math.min(1, volume));
    return { success: true };
  }

  /**
   * Play a test tone (440Hz sine wave for 500ms) to verify the audio path.
   */
  playTestTone() {
    if (!this._initialized || !this._rtAudio) {
      return { success: false, error: 'Engine not initialized' };
    }

    // Flush any queued silence so tone plays immediately
    try { this._rtAudio.clearOutputQueue(); } catch (e) { /* ignore */ }

    const duration = 0.5;
    const freq = 440;
    const numSamples = Math.floor(this._sampleRate * duration);
    const left = new Float32Array(numSamples);
    const right = new Float32Array(numSamples);

    for (let i = 0; i < numSamples; i++) {
      const t = i / this._sampleRate;
      let envelope = 1.0;
      const fadeFrames = Math.floor(this._sampleRate * 0.01);
      if (i < fadeFrames) envelope = i / fadeFrames;
      if (i > numSamples - fadeFrames) envelope = (numSamples - i) / fadeFrames;

      const sample = Math.sin(2 * Math.PI * freq * t) * 0.5 * envelope;
      left[i] = sample;
      right[i] = sample;
    }

    const testKey = '__test_tone__';
    this._soundCache.set(testKey, {
      pcm: [left, right],
      sampleRate: this._sampleRate,
      channels: 2,
      length: numSamples
    });

    this._activeVoices.delete(testKey);
    this._activeVoices.set(testKey, [{
      cursor: 0,
      volume: 1.0,
      loop: false,
      id: this._nextVoiceId++
    }]);

    return { success: true, samples: numSamples };
  }

  shutdown() {
    if (this._mixInterval) {
      clearInterval(this._mixInterval);
      this._mixInterval = null;
    }

    if (this._rtAudio) {
      try {
        this._rtAudio.stop();
        this._rtAudio.closeStream();
      } catch (err) {
        console.error('[DirectAudio] Error closing stream:', err);
      }
      this._rtAudio = null;
    }

    this._activeVoices.clear();
    this._soundCache.clear();
    this._initialized = false;
    this._deviceId = null;
    this._deviceName = null;

    console.log('[DirectAudio] Engine shut down');
    return { success: true };
  }

  isInitialized() {
    return this._initialized;
  }

  // --- Private methods ---

  _ensureModules() {
    if (!this._RtAudio) {
      try {
        const audify = require('audify');
        this._RtAudio = audify.RtAudio;
        this._RtAudioApi = audify.RtAudioApi;
        this._RtAudioFormat = audify.RtAudioFormat;
      } catch (err) {
        throw new Error(`Failed to load audify: ${err.message}`);
      }
    }
  }

  async _ensureAudioDecode() {
    if (!this._audioDecode) {
      // Use built-in WAV decoder first; fall back to audio-decode for other formats
      this._audioDecode = async (buffer) => {
        // Try WAV first (most common for soundboards)
        const wavResult = this._decodeWav(buffer);
        if (wavResult) return wavResult;

        // Fallback to audio-decode for MP3/OGG/etc
        try {
          const mod = await import('audio-decode');
          const decode = mod.default || mod;
          return await decode(buffer);
        } catch (err) {
          throw new Error(`Unsupported audio format (WAV decode failed, audio-decode unavailable: ${err.message})`);
        }
      };
    }
  }

  /**
   * Decode a WAV file buffer into AudioBuffer-like object.
   * Returns null if not a valid WAV file.
   */
  _decodeWav(buffer) {
    try {
      const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

      // Check RIFF header
      if (view.getUint32(0, false) !== 0x52494646) return null; // "RIFF"
      if (view.getUint32(8, false) !== 0x57415645) return null; // "WAVE"

      let offset = 12;
      let fmtFound = false;
      let audioFormat, numChannels, sampleRate, bitsPerSample;
      let dataOffset = -1, dataSize = -1;

      // Parse chunks
      while (offset < buffer.length - 8) {
        const chunkId = view.getUint32(offset, false);
        const chunkSize = view.getUint32(offset + 4, true);

        if (chunkId === 0x666D7420) { // "fmt "
          audioFormat = view.getUint16(offset + 8, true);
          numChannels = view.getUint16(offset + 10, true);
          sampleRate = view.getUint32(offset + 12, true);
          bitsPerSample = view.getUint16(offset + 22, true);
          fmtFound = true;
        } else if (chunkId === 0x64617461) { // "data"
          dataOffset = offset + 8;
          dataSize = chunkSize;
        }

        offset += 8 + chunkSize;
        if (offset % 2 !== 0) offset++; // WAV chunks are word-aligned
      }

      if (!fmtFound || dataOffset < 0) return null;
      if (audioFormat !== 1 && audioFormat !== 3) return null; // 1=PCM int, 3=PCM float

      const bytesPerSample = bitsPerSample / 8;
      const numSamples = Math.floor(dataSize / (bytesPerSample * numChannels));

      const channelData = [];
      for (let ch = 0; ch < numChannels; ch++) {
        channelData.push(new Float32Array(numSamples));
      }

      for (let i = 0; i < numSamples; i++) {
        for (let ch = 0; ch < numChannels; ch++) {
          const pos = dataOffset + (i * numChannels + ch) * bytesPerSample;
          let sample;

          if (audioFormat === 3) {
            // Float32
            sample = view.getFloat32(pos, true);
          } else if (bitsPerSample === 16) {
            sample = view.getInt16(pos, true) / 32768;
          } else if (bitsPerSample === 24) {
            const b0 = buffer[pos], b1 = buffer[pos + 1], b2 = buffer[pos + 2];
            let val = (b2 << 16) | (b1 << 8) | b0;
            if (val >= 0x800000) val -= 0x1000000;
            sample = val / 8388608;
          } else if (bitsPerSample === 32) {
            sample = view.getInt32(pos, true) / 2147483648;
          } else if (bitsPerSample === 8) {
            sample = (buffer[pos] - 128) / 128;
          } else {
            return null;
          }

          channelData[ch][i] = sample;
        }
      }

      return {
        sampleRate,
        numberOfChannels: numChannels,
        length: numSamples,
        getChannelData: (ch) => channelData[ch]
      };
    } catch (e) {
      return null;
    }
  }

  /**
   * Probe the ASIO driver's actual buffer size by trying writes of increasing size.
   * ASIO drivers override the requested frameSize; audify rejects mismatched writes.
   */
  _probeBufferSize() {
    const candidates = [128, 256, 512, 1024, 2048, 4096];
    for (const frames of candidates) {
      const buf = Buffer.alloc(frames * this._channels * 4);
      try {
        this._rtAudio.write(buf);
        return frames;
      } catch (e) {
        // Wrong size, try next
      }
    }
    // Default fallback
    return 512;
  }

  /**
   * Mix loop: writes interleaved float32 PCM to the ASIO output via setInterval.
   * Only writes when there are active voices — avoids queue buildup.
   */
  _startMixLoop() {
    const framesPerBuffer = this._framesPerBuffer;
    const channels = this._channels;

    // Match interval to buffer duration so we don't outpace the ASIO driver
    const intervalMs = Math.max(5, Math.floor((framesPerBuffer / this._sampleRate) * 1000));

    this._mixInterval = setInterval(() => {
      if (!this._rtAudio) return;

      // Don't write anything when idle — prevents queue from growing with silence
      if (this._activeVoices.size === 0) return;

      const floatView = new Float32Array(framesPerBuffer * channels);

      // Mix all active voices
      for (const [filePath, voices] of this._activeVoices.entries()) {
        const cached = this._soundCache.get(filePath);
        if (!cached) continue;

        const voicesToRemove = [];

        for (let vi = 0; vi < voices.length; vi++) {
          const voice = voices[vi];
          const leftPcm = cached.pcm[0];
          const rightPcm = cached.pcm.length > 1 ? cached.pcm[1] : cached.pcm[0];
          const pcmLength = cached.length;
          const vol = voice.volume * this._masterVolume;

          for (let frame = 0; frame < framesPerBuffer; frame++) {
            const sampleIndex = voice.cursor + frame;

            if (sampleIndex >= pcmLength) {
              if (voice.loop) {
                voice.cursor = -(frame);
                break;
              } else {
                voicesToRemove.push(vi);
                break;
              }
            }

            const left = leftPcm[sampleIndex] * vol;
            const right = rightPcm[sampleIndex] * vol;

            floatView[frame * channels] += left;
            floatView[frame * channels + 1] += right;
          }

          if (!voicesToRemove.includes(vi)) {
            voice.cursor += framesPerBuffer;
          }
        }

        // Remove finished voices (reverse order)
        for (let i = voicesToRemove.length - 1; i >= 0; i--) {
          voices.splice(voicesToRemove[i], 1);
        }

        if (voices.length === 0) {
          this._activeVoices.delete(filePath);
        }
      }

      // Clamp output
      for (let i = 0; i < floatView.length; i++) {
        if (floatView[i] > 1.0) floatView[i] = 1.0;
        else if (floatView[i] < -1.0) floatView[i] = -1.0;
      }

      // Write interleaved float32 buffer to ASIO output
      const buffer = Buffer.from(floatView.buffer);
      try {
        this._rtAudio.write(buffer);
      } catch (err) {
        console.error('[DirectAudio] Write error:', err.message);
      }
    }, intervalMs);
  }

  /**
   * Resample channel data using linear interpolation.
   */
  _resampleChannels(channelData, srcRate, dstRate) {
    const ratio = srcRate / dstRate;
    const srcLength = channelData[0].length;
    const dstLength = Math.ceil(srcLength / ratio);

    return channelData.map(srcChannel => {
      const dst = new Float32Array(dstLength);
      for (let i = 0; i < dstLength; i++) {
        const srcPos = i * ratio;
        const srcIndex = Math.floor(srcPos);
        const frac = srcPos - srcIndex;

        if (srcIndex + 1 < srcLength) {
          dst[i] = srcChannel[srcIndex] * (1 - frac) + srcChannel[srcIndex + 1] * frac;
        } else if (srcIndex < srcLength) {
          dst[i] = srcChannel[srcIndex];
        }
      }
      return dst;
    });
  }
}

module.exports = { AsioAudioEngine };
