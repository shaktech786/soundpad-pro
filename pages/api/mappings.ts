import type { NextApiRequest, NextApiResponse } from 'next'
import fs from 'fs'
import path from 'path'
import os from 'os'

// Get the electron-store config file path
function getStorePath(): string {
  const appName = 'soundpad-pro'
  const configName = 'soundpad-pro-settings.json'

  if (process.platform === 'win32') {
    return path.join(os.homedir(), 'AppData', 'Roaming', appName, configName)
  } else if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', appName, configName)
  } else {
    return path.join(os.homedir(), '.config', appName, configName)
  }
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const storePath = getStorePath()

    if (!fs.existsSync(storePath)) {
      // Return empty defaults if no config exists yet
      return res.status(200).json({
        'soundpad-mappings': [],
        'combined-action-mappings': [],
        'button-volumes': [],
        'haute42-button-mapping': null,
        'haute42-stop-button': null,
        'soundpad-board-layout': null,
        'soundpad-button-shape': null,
      })
    }

    const data = fs.readFileSync(storePath, 'utf-8')
    const config = JSON.parse(data)

    // Return the relevant mappings
    res.status(200).json({
      'soundpad-mappings': config['soundpad-mappings'] || [],
      'combined-action-mappings': config['combined-action-mappings'] || [],
      'button-volumes': config['button-volumes'] || [],
      'haute42-button-mapping': config['haute42-button-mapping'] || null,
      'haute42-stop-button': config['haute42-stop-button'] || null,
      'soundpad-board-layout': config['soundpad-board-layout'] || null,
      'soundpad-button-shape': config['soundpad-button-shape'] || null,
    })
  } catch (error) {
    console.error('Error reading mappings:', error)
    res.status(500).json({ error: 'Failed to read mappings' })
  }
}
