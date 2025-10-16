import { useState, useEffect, useCallback } from 'react'

export interface AudioDevice {
  deviceId: string
  label: string
  kind: string
}

export function useAudioOutputDevice() {
  const [audioDevices, setAudioDevices] = useState<AudioDevice[]>([])
  const [selectedDevice, setSelectedDevice] = useState<string>('')
  const [loading, setLoading] = useState(true)

  // Load saved device preference
  useEffect(() => {
    const savedDevice = localStorage.getItem('audio-output-device')
    if (savedDevice) {
      setSelectedDevice(savedDevice)
    }
  }, [])

  // Enumerate audio output devices
  const enumerateDevices = useCallback(async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        console.warn('enumerateDevices() not supported')
        setLoading(false)
        return
      }

      // Request microphone permission to get device labels
      // This is required for the browser to show friendly device names
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        // Immediately stop the stream - we only needed permission
        stream.getTracks().forEach(track => track.stop())
      } catch (permError) {
        console.warn('Microphone permission denied, device labels may not be available:', permError)
      }

      const devices = await navigator.mediaDevices.enumerateDevices()

      // Log all devices for debugging
      console.log('All enumerated devices:', devices)

      const audioOutputs = devices
        .filter(device => device.kind === 'audiooutput')
        .map((device, index) => ({
          deviceId: device.deviceId,
          label: device.label || `Audio Output ${device.deviceId.substring(0, 8)}`,
          kind: device.kind,
          groupId: device.groupId
        }))

      // Deduplicate devices with same label - keep first occurrence
      const uniqueDevices = audioOutputs.reduce((acc, device) => {
        // For VoiceMeeter devices with identical names, keep only the first one
        const existingDevice = acc.find(d => d.label === device.label)
        if (!existingDevice) {
          acc.push(device)
        }
        return acc
      }, [] as typeof audioOutputs)

      const deduplicatedDevices = uniqueDevices

      console.log('Audio output devices (raw):', audioOutputs)
      console.log('Audio output devices (deduplicated):', deduplicatedDevices)

      setAudioDevices(deduplicatedDevices)

      // Auto-select VoiceMeeter device if available and no device selected
      if (!selectedDevice && deduplicatedDevices.length > 0) {
        // Priority 1: Look for VoiceMeeter Aux (VAIO3) - ideal for SoundPad Pro
        let vmDevice = deduplicatedDevices.find(d =>
          d.label.toLowerCase().includes('voicemeeter') &&
          d.label.toLowerCase().includes('aux')
        )

        // Priority 2: Fall back to regular VoiceMeeter VAIO
        if (!vmDevice) {
          vmDevice = deduplicatedDevices.find(d =>
            d.label.toLowerCase().includes('voicemeeter') &&
            d.label.toLowerCase().includes('vaio')
          )
        }

        if (vmDevice) {
          console.log('Auto-selecting VoiceMeeter device:', vmDevice.label)
          setSelectedDevice(vmDevice.deviceId)
          localStorage.setItem('audio-output-device', vmDevice.deviceId)
        } else {
          console.warn('No VoiceMeeter device found. Available devices:', deduplicatedDevices.map(d => d.label))
        }
      }

      setLoading(false)
    } catch (error) {
      console.error('Error enumerating devices:', error)
      setLoading(false)
    }
  }, [selectedDevice])

  // Initial enumeration
  useEffect(() => {
    enumerateDevices()

    // Listen for device changes
    if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', enumerateDevices)
      return () => {
        navigator.mediaDevices.removeEventListener('devicechange', enumerateDevices)
      }
    }
  }, [enumerateDevices])

  // Update selected device
  const selectDevice = useCallback((deviceId: string) => {
    setSelectedDevice(deviceId)
    localStorage.setItem('audio-output-device', deviceId)
    console.log('Audio output device changed to:', deviceId)
  }, [])

  // Apply device to audio element
  const applyToAudioElement = useCallback(async (audioElement: HTMLMediaElement) => {
    if (!selectedDevice || !audioElement.setSinkId) {
      return
    }

    try {
      await audioElement.setSinkId(selectedDevice)
      console.log('Audio output routed to:', selectedDevice)
    } catch (error) {
      console.error('Error setting audio output device:', error)
    }
  }, [selectedDevice])

  return {
    audioDevices,
    selectedDevice,
    selectDevice,
    applyToAudioElement,
    loading,
    refresh: enumerateDevices
  }
}
