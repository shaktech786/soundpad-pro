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
      const audioOutputs = devices
        .filter(device => device.kind === 'audiooutput')
        .map(device => ({
          deviceId: device.deviceId,
          label: device.label || `Audio Output ${device.deviceId.substring(0, 8)}`,
          kind: device.kind
        }))

      console.log('Found audio output devices:', audioOutputs)
      setAudioDevices(audioOutputs)

      // Auto-select VoiceMeeter Aux if available and no device selected
      if (!selectedDevice && audioOutputs.length > 0) {
        const vmAux = audioOutputs.find(d =>
          d.label.toLowerCase().includes('voicemeeter') &&
          d.label.toLowerCase().includes('aux')
        )

        if (vmAux) {
          console.log('Auto-selecting VoiceMeeter Aux Input:', vmAux.label)
          setSelectedDevice(vmAux.deviceId)
          localStorage.setItem('audio-output-device', vmAux.deviceId)
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
