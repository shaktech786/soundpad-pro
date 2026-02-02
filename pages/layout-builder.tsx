import Head from 'next/head'
import { BoardBuilder } from '../components/BoardBuilder'
import { usePersistentStorage } from '../hooks/usePersistentStorage'
import { useProfileManager } from '../hooks/useProfileManager'
import { ButtonPosition, ButtonShape } from '../types/profile'
import { APP_CONFIG, HAUTE42_LAYOUT } from '../config/constants'

export default function LayoutBuilderPage() {
  const [boardLayout, setBoardLayout] = usePersistentStorage<ButtonPosition[]>(
    APP_CONFIG.PROFILES.STORAGE_KEYS.BOARD_LAYOUT,
    HAUTE42_LAYOUT
  )
  const [buttonShape, setButtonShape] = usePersistentStorage<ButtonShape>(
    APP_CONFIG.PROFILES.STORAGE_KEYS.BUTTON_SHAPE,
    'circle'
  )
  const { activeProfileId, updateProfileLayout } = useProfileManager()

  const handleSave = (layout: ButtonPosition[], shape: ButtonShape) => {
    setBoardLayout(layout)
    setButtonShape(shape)
    if (activeProfileId) {
      updateProfileLayout(activeProfileId, layout, shape)
    }
    alert('Layout saved!')
  }

  return (
    <>
      <Head>
        <title>Layout Builder - SoundPad Pro</title>
      </Head>

      <div className="min-h-screen bg-gray-950 py-8">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-6">
            <h1 className="text-4xl font-bold text-white mb-2">Board Layout Builder</h1>
            <p className="text-gray-400">Design your controller button layout</p>
          </div>

          <div className="bg-gray-900 rounded-xl p-8">
            <BoardBuilder
              initialLayout={boardLayout}
              initialShape={buttonShape}
              onSave={handleSave}
              showPresets
            />
          </div>
        </div>
      </div>
    </>
  )
}
