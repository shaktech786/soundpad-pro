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

  // Write diagnostic info to file via Electron IPC
  const writeDiag = useCallback(async (msg: string) => {
    console.log('[AudioDiag]', msg)
    try {
      if ((window as any).electronAPI?.writeAudioDiag) {
        await (window as any).electronAPI.writeAudioDiag(msg)
      }
    } catch {}
  }, [])

  // Enumerate audio output devices
  const enumerateDevices = useCallback(async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        console.warn('enumerateDevices() not supported')
        writeDiag('enumerateDevices() not supported')
        setLoading(false)
        return
      }

      // Request microphone permission to get device labels
      // This is required for the browser to show friendly device names
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        // Immediately stop the stream - we only needed permission
        stream.getTracks().forEach(track => track.stop())
        writeDiag('Microphone permission granted')
      } catch (permError) {
        console.warn('Microphone permission denied, device labels may not be available:', permError)
        writeDiag(`Microphone permission DENIED: ${permError}`)
      }

      const devices = await navigator.mediaDevices.enumerateDevices()

      // Log all devices for debugging
      console.log('All enumerated devices:', devices)
      writeDiag(`Total devices found: ${devices.length}`)
      devices.forEach(d => writeDiag(`  ${d.kind}: id=${d.deviceId.substring(0, 20)}... label="${d.label}"`))

      const audioOutputs = devices
        .filter(device => device.kind === 'audiooutput')
        .map((device, index) => ({
          deviceId: device.deviceId,
          label: device.label || `Audio Output ${device.deviceId.substring(0, 8)}`,
          kind: device.kind,
          groupId: device.groupId
        }))

      // Count occurrences of each label
      const labelTotals: Record<string, number> = {}
      audioOutputs.forEach(device => {
        labelTotals[device.label] = (labelTotals[device.label] || 0) + 1
      })

      // For duplicate labels, append index to distinguish them
      const labelCounters: Record<string, number> = {}
      const deduplicatedDevices = audioOutputs.map(device => {
        if (labelTotals[device.label] > 1) {
          const idx = (labelCounters[device.label] || 0) + 1
          labelCounters[device.label] = idx
          return { ...device, label: `${device.label} #${idx}` }
        }
        return device
      })

      console.log('Audio output devices (raw):', audioOutputs)
      console.log('Audio output devices (deduplicated):', deduplicatedDevices)

      setAudioDevices(deduplicatedDevices)

      // Auto-select CABLE Input for routing through VoiceMeeter
      if (!selectedDevice && deduplicatedDevices.length > 0) {
        let vmDevice = deduplicatedDevices.find(d =>
          d.label.toLowerCase().includes('cable input')
        )

        if (vmDevice) {
          console.log('Auto-selecting CABLE Input device:', vmDevice.label)
          setSelectedDevice(vmDevice.deviceId)
          localStorage.setItem('audio-output-device', vmDevice.deviceId)
        } else {
          console.warn('No CABLE Input device found. Available devices:', deduplicatedDevices.map(d => d.label))
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
