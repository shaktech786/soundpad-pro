import { useState } from 'react'
import Head from 'next/head'
import { useSimpleGamepad } from '../hooks/useSimpleGamepad'
import { useAudioEngine } from '../hooks/useAudioEngine'

export default function TestPage() {
  const { buttonStates, connected } = useSimpleGamepad()
  const { playSound, stopAll } = useAudioEngine()
  const [soundMappings, setSoundMappings] = useState<Map<number, string>>(new Map())

  const handlePlaySound = (url: string) => {
    const cleanUrl = url.split('#')[0]
    playSound(cleanUrl, { restart: true })
  }

  const handleMapSound = async (index: number) => {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.selectAudioFile) {
      try {
        const result = await (window as any).electronAPI.selectAudioFile()
        if (result && result.filePath) {
          setSoundMappings(prev => new Map(prev).set(index, result.filePath))
        }
      } catch (error) {
        console.error('Error selecting file:', error)
      }
    }
  }

  const buttons = Array.from({ length: 16 }, (_, i) => i)

  return (
    <>
      <Head>
        <title>SoundPad Pro - Test</title>
      </Head>

      <div className="min-h-screen bg-gray-950 py-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-6">
            <h1 className="text-3xl font-bold text-white mb-2">SoundPad Pro - Test Mode</h1>
            <div className={`inline-block px-4 py-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`}>
              <span className="text-white font-bold">
                {connected ? '✓ Controller Connected' : '✗ No Controller'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-3 max-w-lg mx-auto">
            {buttons.map(index => {
              const isPressed = buttonStates.get(index)
              const sound = soundMappings.get(index)
              return (
                <button
                  key={index}
                  onClick={() => sound ? handlePlaySound(sound) : handleMapSound(index)}
                  className={`aspect-square rounded-lg border-2 flex items-center justify-center text-sm font-bold transition-colors ${
                    isPressed
                      ? 'bg-blue-500 border-blue-400 text-white'
                      : sound
                        ? 'bg-gray-700 border-gray-600 text-gray-200 hover:bg-gray-600'
                        : 'bg-gray-800 border-gray-700 text-gray-500 hover:bg-gray-700'
                  }`}
                >
                  {sound ? sound.split(/[\\/]/).pop()?.slice(0, 10) : `Pad ${index}`}
                </button>
              )
            })}
          </div>

          <div className="mt-6 text-center">
            <button
              onClick={stopAll}
              className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg"
            >
              STOP ALL SOUNDS
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
