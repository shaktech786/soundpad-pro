import React from 'react'

interface BackupRestoreProps {
  onExport: () => void
  onImport: (file: File) => void
}

export const BackupRestore: React.FC<BackupRestoreProps> = ({ onExport, onImport }) => {
  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      onImport(file)
      event.target.value = ''
    }
  }

  return (
    <div className="bg-gray-700 rounded-lg p-4">
      <h3 className="text-lg font-semibold mb-3">Backup & Restore</h3>
      <p className="text-sm text-gray-400 mb-4">
        Export your settings to a file or restore from a backup.
        Settings are also automatically saved to your app data folder.
      </p>
      <div className="flex gap-3">
        <button
          onClick={onExport}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
          </svg>
          Export Settings
        </button>
        <label className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg transition cursor-pointer flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          Import Settings
          <input
            type="file"
            accept=".json"
            onChange={handleImport}
            className="hidden"
          />
        </label>
      </div>
      <div className="mt-4 p-3 bg-gray-800 rounded text-xs text-gray-400">
        <strong>Data Location:</strong><br />
        %APPDATA%\soundpad-pro\soundpad-pro-settings.json
      </div>
    </div>
  )
}