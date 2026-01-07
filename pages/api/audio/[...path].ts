import type { NextApiRequest, NextApiResponse } from 'next'
import fs from 'fs'
import path from 'path'

// Serve local audio files for OBS dock
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Reconstruct the file path from the URL segments
    const pathSegments = req.query.path as string[]
    if (!pathSegments || pathSegments.length === 0) {
      return res.status(400).json({ error: 'No path provided' })
    }

    // Reconstruct Windows path: C:/Users/... -> C:\Users\...
    let filePath = pathSegments.join('/')

    // Handle drive letter (first segment might be "C:" or similar)
    if (pathSegments[0].match(/^[A-Z]:$/i)) {
      filePath = pathSegments[0] + '/' + pathSegments.slice(1).join('/')
    }

    // Normalize to Windows path
    filePath = filePath.replace(/\//g, '\\')

    // Security: Only allow audio files from specific directories
    const allowedPaths = [
      'C:\\Users\\shake\\Documents\\SoundBoard',
      'C:\\Users\\shake\\Music',
      'C:\\Users\\shake\\Downloads'
    ]

    const isAllowed = allowedPaths.some(allowed =>
      filePath.toLowerCase().startsWith(allowed.toLowerCase())
    )

    if (!isAllowed) {
      console.error('Path not allowed:', filePath)
      return res.status(403).json({ error: 'Path not allowed' })
    }

    if (!fs.existsSync(filePath)) {
      console.error('File not found:', filePath)
      return res.status(404).json({ error: 'File not found' })
    }

    // Get file extension and set content type
    const ext = path.extname(filePath).toLowerCase()
    const mimeTypes: Record<string, string> = {
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.ogg': 'audio/ogg',
      '.webm': 'audio/webm',
      '.m4a': 'audio/mp4',
      '.flac': 'audio/flac',
      '.aac': 'audio/aac',
      '.opus': 'audio/opus'
    }

    const contentType = mimeTypes[ext] || 'application/octet-stream'

    // Get file stats for content-length
    const stat = fs.statSync(filePath)

    // Set headers
    res.setHeader('Content-Type', contentType)
    res.setHeader('Content-Length', stat.size)
    res.setHeader('Accept-Ranges', 'bytes')
    res.setHeader('Cache-Control', 'public, max-age=3600')

    // Stream the file
    const readStream = fs.createReadStream(filePath)
    readStream.pipe(res)

  } catch (error) {
    console.error('Error serving audio:', error)
    res.status(500).json({ error: 'Failed to serve audio' })
  }
}

export const config = {
  api: {
    responseLimit: false,
  },
}
