const fs = require('fs').promises;
const path = require('path');

/**
 * Direct Audio Engine for SoundPad Pro
 *
 * Routes audio directly to VoiceMeeter AUX Input via PortAudio (WASAPI/WDM-KS).
 * Uses naudiodon for audio output and audio-decode for file decoding.
 *
 * The prebuilt PortAudio DLL includes WASAPI, WDM-KS, and MME host APIs.
 * We target the "VoiceMeeter Aux Input" device which feeds Strip[4] (AUX).
 *
 * If ASIO host API is available (custom PortAudio build), it will also be detected.
 */

class AsioAudioEngine {
  constructor() {
    // Lazy-load native modules (may not be available in renderer)
    this._portAudio = null;
    this._audioDecode = null;

    this._stream = null;
    this._mixInterval = null;
    this._initialized = false;

    // Audio format - VoiceMeeter Banana runs at 48000Hz natively
    this._sampleRate = 48000;
    this._channels = 2; // Stereo output to VoiceMeeter AUX Input
    this._framesPerBuffer = 2048; // Larger buffer to prevent underflow with setInterval

    // Sound cache: filePath -> { pcm: Float32Array[], sampleRate: number, channels: number, length: number }
    this._soundCache = new Map();

    // Active voices: Map<filePath, [{ cursor: number, volume: number, loop: boolean, id: number }]>
    this._activeVoices = new Map();
    this._nextVoiceId = 0;

    this._masterVolume = 1.0;

    // Device info
    this._deviceId = null;
    this._deviceName = null;
  }

  /**
   * Get available output devices suitable for direct routing.
   * Returns ASIO devices if available, otherwise WASAPI/WDM-KS VoiceMeeter devices.
   */
  getAsioDevices() {
    this._ensureModules();
    const devices = this._portAudio.getDevices();

    // First try ASIO
    const asioDevices = devices
      .filter(d => d.maxOutputChannels > 0 && d.hostAPIName && d.hostAPIName.toLowerCase().includes('asio'))
      .map(d => ({
        id: d.id,
        name: d.name,
        maxOutputChannels: d.maxOutputChannels,
        defaultSampleRate: d.defaultSampleRate,
        hostAPI: d.hostAPIName
      }));

    if (asioDevices.length > 0) return asioDevices;

    // Fall back to all VoiceMeeter output devices (MME, WASAPI, WDM-KS)
    return devices
      .filter(d => d.maxOutputChannels > 0 && d.name.toLowerCase().includes('voicemeeter'))
      .map(d => ({
        id: d.id,
        name: d.name,
        maxOutputChannels: d.maxOutputChannels,
        defaultSampleRate: d.defaultSampleRate,
        hostAPI: d.hostAPIName
      }));
  }

  /**
   * Auto-detect VoiceMeeter AUX Input device.
   * Priority: ASIO > MME "VoiceMeeter Aux Input" > WASAPI > WDM-KS
   * MME is preferred over WASAPI/WDM-KS because it reliably opens VoiceMeeter virtual devices.
   */
  findVoiceMeeterAsio() {
    this._ensureModules();
    const devices = this._portAudio.getDevices();

    // Priority 1: ASIO VoiceMeeter device (if custom PortAudio build with ASIO SDK)
    const asioDevice = devices.find(d =>
      d.maxOutputChannels > 0 &&
      d.hostAPIName && d.hostAPIName.toLowerCase().includes('asio') &&
      d.name.toLowerCase().includes('voicemeeter')
    );
    if (asioDevice) {
      return {
        id: asioDevice.id,
        name: asioDevice.name,
        maxOutputChannels: asioDevice.maxOutputChannels,
        defaultSampleRate: asioDevice.defaultSampleRate,
        hostAPI: asioDevice.hostAPIName,
        mode: 'asio'
      };
    }

    // Priority 2: MME "VoiceMeeter Aux Input" - most reliable for VoiceMeeter virtual devices
    const mmeAux = devices.find(d =>
      d.maxOutputChannels > 0 &&
      d.hostAPIName && d.hostAPIName === 'MME' &&
      d.name.toLowerCase().includes('voicemeeter aux input')
    );
    if (mmeAux) {
      return {
        id: mmeAux.id,
        name: mmeAux.name,
        maxOutputChannels: mmeAux.maxOutputChannels,
        defaultSampleRate: mmeAux.defaultSampleRate,
        hostAPI: mmeAux.hostAPIName,
        mode: 'mme'
      };
    }

    // Priority 3: WASAPI "VoiceMeeter Aux Input"
    const wasapiAux = devices.find(d =>
      d.maxOutputChannels > 0 &&
      d.hostAPIName && d.hostAPIName.includes('WASAPI') &&
      d.name.toLowerCase().includes('voicemeeter aux input')
    );
    if (wasapiAux) {
      return {
        id: wasapiAux.id,
        name: wasapiAux.name,
        maxOutputChannels: wasapiAux.maxOutputChannels,
        defaultSampleRate: wasapiAux.defaultSampleRate,
        hostAPI: wasapiAux.hostAPIName,
        mode: 'wasapi'
      };
    }

    // Priority 4: WDM-KS "Speakers (VoiceMeeter Aux vaio)"
    const wdmAux = devices.find(d =>
      d.maxOutputChannels > 0 &&
      d.hostAPIName && d.hostAPIName.includes('WDM-KS') &&
      d.name.toLowerCase().includes('voicemeeter aux')
    );
    if (wdmAux) {
      return {
        id: wdmAux.id,
        name: wdmAux.name,
        maxOutputChannels: wdmAux.maxOutputChannels,
        defaultSampleRate: wdmAux.defaultSampleRate,
        hostAPI: wdmAux.hostAPIName,
        mode: 'wdm-ks'
      };
    }

    return null;
  }

  /**
   * Initialize output stream to VoiceMeeter AUX
   * @param {number} [deviceId] - Specific device ID. If omitted, auto-detects VoiceMeeter AUX.
   */
  initialize(deviceId) {
    if (this._initialized) {
      console.log('[DirectAudio] Already initialized');
      return { success: true, device: this._deviceName };
    }

    this._ensureModules();

    let device;
    let mode = 'unknown';
    if (deviceId !== undefined) {
      const devices = this._portAudio.getDevices();
      device = devices.find(d => d.id === deviceId);
      if (!device) {
        throw new Error(`Device with id ${deviceId} not found`);
      }
      mode = device.hostAPIName || 'unknown';
    } else {
      const found = this.findVoiceMeeterAsio();
      if (!found) {
        throw new Error('VoiceMeeter AUX Input device not found. Is VoiceMeeter Banana running?');
      }
      device = found;
      mode = found.mode || found.hostAPI;
    }

    this._deviceId = device.id;
    this._deviceName = device.name;
    // Force 48000Hz - VoiceMeeter Banana's native sample rate.
    // MME may report 44100Hz but VoiceMeeter resamples internally anyway.
    this._sampleRate = 48000;

    // For ASIO with 4+ channels, use 4 channels (ch 3-4 = AUX).
    // For WASAPI/WDM-KS targeting VoiceMeeter Aux Input directly, use 2 channels (stereo).
    if (mode === 'asio' && device.maxOutputChannels >= 4) {
      this._channels = 4;
      this._channelOffset = 2; // Write to channels 3-4 (index 2-3)
    } else {
      this._channels = Math.min(device.maxOutputChannels, 2);
      this._channelOffset = 0; // Write to channels 1-2 (index 0-1)
    }

    console.log(`[DirectAudio] Opening: ${device.name} (id=${device.id}, mode=${mode})`);
    console.log(`[DirectAudio] Rate: ${this._sampleRate}, Ch: ${this._channels}, Offset: ${this._channelOffset}, Buf: ${this._framesPerBuffer}`);

    this._stream = new this._portAudio.AudioIO({
      outOptions: {
        channelCount: this._channels,
        sampleFormat: this._portAudio.SampleFormatFloat32,
        sampleRate: this._sampleRate,
        deviceId: this._deviceId,
        closeOnError: false
      }
    });

    this._stream.on('error', (err) => {
      console.error('[DirectAudio] Stream error:', err);
    });

    this._stream.start();
    this._startMixLoop();
    this._initialized = true;

    console.log(`[DirectAudio] Stream started on ${device.name} via ${mode}`);
    return {
      success: true,
      device: device.name,
      sampleRate: this._sampleRate,
      channels: this._channels,
      mode
    };
  }

  /**
   * Load and decode an audio file to PCM cache
   */
  async loadSound(filePath) {
    if (this._soundCache.has(filePath)) {
      return { success: true, cached: true };
    }

    this._ensureModules();
    await this._ensureAudioDecode();

    try {
      const fileBuffer = await fs.readFile(filePath);

      // audio-decode returns an AudioBuffer-like object
      const audioBuffer = await this._audioDecode(fileBuffer);

      const srcRate = audioBuffer.sampleRate;
      const srcChannels = audioBuffer.numberOfChannels;

      // Extract channel data
      const channelData = [];
      for (let ch = 0; ch < srcChannels; ch++) {
        channelData.push(new Float32Array(audioBuffer.getChannelData(ch)));
      }

      // Resample if needed
      let pcmData;
      if (srcRate !== this._sampleRate) {
        pcmData = this._resampleChannels(channelData, srcRate, this._sampleRate);
        console.log(`[DirectAudio] Resampled ${path.basename(filePath)}: ${srcRate}Hz -> ${this._sampleRate}Hz`);
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

      console.log(`[DirectAudio] Loaded: ${path.basename(filePath)} (${pcmData[0].length} samples, ${pcmData.length}ch)`);
      return { success: true, cached: false, samples: pcmData[0].length, duration: pcmData[0].length / this._sampleRate };
    } catch (err) {
      console.error(`[DirectAudio] Failed to load ${filePath}:`, err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Unload a cached sound
   */
  unloadSound(filePath) {
    this._soundCache.delete(filePath);
    this._activeVoices.delete(filePath);
    return { success: true };
  }

  /**
   * Play a sound (add a voice to the mixer)
   */
  playSound(filePath, options = {}) {
    const cached = this._soundCache.get(filePath);
    if (!cached) {
      console.warn(`[DirectAudio] Sound not loaded: ${filePath}`);
      return { success: false, error: 'Sound not loaded' };
    }

    const volume = options.volume !== undefined ? options.volume : 1.0;
    const loop = options.loop || false;
    const restart = options.restart || false;

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

  /**
   * Stop a specific sound
   */
  stopSound(filePath) {
    this._activeVoices.delete(filePath);
    return { success: true };
  }

  /**
   * Stop all sounds
   */
  stopAll() {
    this._activeVoices.clear();
    return { success: true };
  }

  /**
   * Set volume for a specific sound
   */
  setVolume(filePath, volume) {
    const voices = this._activeVoices.get(filePath);
    if (voices) {
      for (const voice of voices) {
        voice.volume = Math.max(0, Math.min(1, volume));
      }
    }
    return { success: true };
  }

  /**
   * Set master volume
   */
  setMasterVolume(volume) {
    this._masterVolume = Math.max(0, Math.min(1, volume));
    return { success: true };
  }

  /**
   * Shutdown the engine
   */
  shutdown() {
    if (this._mixInterval) {
      clearInterval(this._mixInterval);
      this._mixInterval = null;
    }

    if (this._stream) {
      try {
        this._stream.quit();
      } catch (err) {
        console.error('[DirectAudio] Error closing stream:', err);
      }
      this._stream = null;
    }

    this._activeVoices.clear();
    this._soundCache.clear();
    this._initialized = false;
    this._deviceId = null;
    this._deviceName = null;

    console.log('[DirectAudio] Engine shut down');
    return { success: true };
  }

  /**
   * Check if engine is initialized
   */
  isInitialized() {
    return this._initialized;
  }

  // --- Private methods ---

  _ensureModules() {
    if (!this._portAudio) {
      try {
        this._portAudio = require('naudiodon');
      } catch (err) {
        throw new Error(`Failed to load naudiodon: ${err.message}`);
      }
    }
    // audio-decode is loaded async via _ensureAudioDecode() since it's ESM-only
  }

  async _ensureAudioDecode() {
    if (!this._audioDecode) {
      try {
        // audio-decode is ESM-only, must use dynamic import()
        const mod = await import('audio-decode');
        this._audioDecode = mod.default || mod;
      } catch (err) {
        throw new Error(`Failed to load audio-decode: ${err.message}`);
      }
    }
  }

  /**
   * Start the mix loop that writes PCM data to the output stream.
   * Uses larger buffers (2048 frames = ~42ms at 48kHz) to avoid underflow
   * with setInterval's imprecise timing.
   */
  _startMixLoop() {
    const framesPerBuffer = this._framesPerBuffer;
    const channels = this._channels;
    const channelOffset = this._channelOffset || 0;
    const bytesPerSample = 4; // Float32
    const bufferSize = framesPerBuffer * channels * bytesPerSample;

    // Pre-fill with silence buffers to prime the PortAudio pipeline
    const silenceBuffer = Buffer.alloc(bufferSize);
    for (let i = 0; i < 3; i++) {
      try { this._stream.write(silenceBuffer); } catch (e) { /* ignore */ }
    }

    // Mix interval: write ahead at ~30ms intervals for 2048-frame buffers (~42ms at 48kHz)
    const intervalMs = Math.max(5, Math.floor((framesPerBuffer / this._sampleRate) * 1000 * 0.7));

    this._mixInterval = setInterval(() => {
      if (!this._stream) return;

      const buffer = Buffer.alloc(bufferSize);
      const floatView = new Float32Array(buffer.buffer, buffer.byteOffset, framesPerBuffer * channels);

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

            // Write stereo at the channel offset
            // For MME/WASAPI: offset=0, writes to ch 1-2
            // For ASIO 4-ch: offset=2, writes to ch 3-4 (AUX)
            floatView[frame * channels + channelOffset] += left;
            floatView[frame * channels + channelOffset + 1] += right;
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

      try {
        this._stream.write(buffer);
      } catch (err) {
        // Stream may have been closed
      }
    }, intervalMs);
  }

  /**
   * Resample channel data using linear interpolation
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
