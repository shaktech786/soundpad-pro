import { useState } from 'react'
import Head from 'next/head'
import { useSimpleGamepad } from '../hooks/useSimpleGamepad'
import { SimplePad } from '../components/SimplePad'
import { useAudioEngine } from '../hooks/useAudioEngine'
import { usePersistentStorage } from '../hooks/usePersistentStorage'

export default function Home() {
  const { buttonStates, connected } = useSimpleGamepad()
  const { playSound, stopAll } = useAudioEngine()
  const [soundMappings, setSoundMappings] = usePersistentStorage<Map<number, string>>(
    'soundpad-mappings',
    new Map()
  )

  const handlePlaySound = (url: string) => {
    const cleanUrl = url.split('#')[0]
    console.log('Playing sound:', cleanUrl)
    playSound(cleanUrl, { restart: true })
  }

  const handleMapSound = async (index: number) => {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.selectAudioFile) {
      try {
        const result = await (window as any).electronAPI.selectAudioFile()
        if (result && result.filePath) {
          console.log(`Mapping pad ${index} to:`, result.filePath)
          setSoundMappings(prev => {
            const newMap = new Map(prev)
            newMap.set(index, result.filePath)
            return newMap
          })
        }
      } catch (error) {
        console.error('Error selecting file:', error)
      }
    }
  }

  const handleClearMapping = (index: number) => {
    setSoundMappings(prev => {
      const newMap = new Map(prev)
      newMap.delete(index)
      return newMap
    })
  }

  return (
    <>
      <Head>
        <title>SoundPad Pro</title>
      </Head>

      <div className="min-h-screen bg-gray-950 py-8">
        <div className="max-w-6xl mx-auto px-4">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-white mb-4">SoundPad Pro</h1>
            <div className="flex items-center justify-center gap-4">
              <div className={`px-6 py-3 rounded-full font-bold ${connected ? 'bg-green-500' : 'bg-red-500'}`}>
                <span className="text-white">
                  {connected ? '✓ Controller Connected' : '✗ No Controller'}
                </span>
              </div>
              <div className="text-gray-400 text-sm">
                {soundMappings.size} / 16 pads mapped
              </div>
            </div>
          </div>

          {/* Pad Grid */}
          <SimplePad
            buttonStates={buttonStates}
            soundMappings={soundMappings}
            onPlaySound={handlePlaySound}
            onMapSound={handleMapSound}
          />

          {/* Controls */}
          <div className="mt-8 flex justify-center gap-4">
            <button
              onClick={stopAll}
              className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition-colors"
            >
              STOP ALL SOUNDS
            </button>
            <button
              onClick={() => {
                if (confirm('Clear all pad mappings?')) {
                  setSoundMappings(new Map())
                }
              }}
              className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded-lg transition-colors"
            >
              CLEAR ALL MAPPINGS
            </button>
          </div>

          {/* Debug Info */}
          <div className="mt-6 p-4 bg-gray-900 rounded-lg">
            <div className="text-white text-sm font-mono">
              <div className="mb-2 font-bold">Debug Info:</div>
              <div>Pressed buttons: {Array.from(buttonStates.entries())
                .filter(([_, pressed]) => pressed)
                .map(([idx]) => `${idx}`)
                .join(', ') || 'None'}</div>
              <div className="mt-2 text-gray-400">
                Instructions: Click empty pads to map sounds. Click mapped pads to play. Press controller buttons to trigger.
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
