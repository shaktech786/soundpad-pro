import React from 'react'

interface AudioStatusProps {
  loadingStates: Map<string, boolean>
  loadErrors: Map<string, string>
  loadedSounds: string[]
}

export const AudioStatus: React.FC<AudioStatusProps> = ({
  loadingStates,
  loadErrors,
  loadedSounds
}) => {
  const hasErrors = loadErrors.size > 0
  const isLoading = loadingStates.size > 0
  
  if (!hasErrors && !isLoading) return null
  
  return (
    <div className="fixed bottom-4 right-4 max-w-sm">
      {/* Loading notifications */}
      {Array.from(loadingStates.entries()).map(([path, _]) => {
        const filename = path.split('/').pop() || 'audio file'
        return (
          <div
            key={path}
            className="mb-2 p-3 bg-blue-600 bg-opacity-90 rounded-lg shadow-lg animate-pulse"
          >
            <div className="flex items-center">
              <svg className="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24">
                <circle 
                  className="opacity-25" 
                  cx="12" 
                  cy="12" 
                  r="10" 
                  stroke="currentColor" 
                  strokeWidth="4"
                  fill="none"
                />
                <path 
                  className="opacity-75" 
                  fill="currentColor" 
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <span className="text-sm">Loading {filename}...</span>
            </div>
          </div>
        )
      })}
      
      {/* Error notifications */}
      {Array.from(loadErrors.entries()).map(([path, error]) => {
        const filename = path.split('/').pop() || 'audio file'
        return (
          <div
            key={path}
            className="mb-2 p-3 bg-red-600 bg-opacity-90 rounded-lg shadow-lg"
          >
            <div className="flex items-start">
              <svg className="h-4 w-4 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <div className="flex-1">
                <p className="text-sm font-medium">Failed to load {filename}</p>
                <p className="text-xs mt-1 opacity-75">{error}</p>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}