import type { NextApiRequest, NextApiResponse } from 'next'

// Store for pending triggers (main app polls this)
let pendingTriggers: { type: string; index: number; timestamp: number; filePath?: string; volume?: number }[] = []

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  // POST - dock sends a trigger
  if (req.method === 'POST') {
    const { type, index, filePath, volume } = req.body
    console.log('[Trigger API] POST received:', { type, index, filePath: filePath?.substring(0, 50), volume })

    if ((type === 'play' || type === 'action') && typeof index === 'number') {
      pendingTriggers.push({ type, index, timestamp: Date.now(), filePath, volume })
      // Keep only last 10 triggers, expire after 5 seconds
      const now = Date.now()
      pendingTriggers = pendingTriggers
        .filter(t => now - t.timestamp < 5000)
        .slice(-10)

      return res.status(200).json({ success: true })
    }

    if (type === 'stop') {
      pendingTriggers.push({ type: 'stop', index: -1, timestamp: Date.now() })
      return res.status(200).json({ success: true })
    }

    return res.status(400).json({ error: 'Invalid trigger' })
  }

  // GET - main app polls for triggers
  if (req.method === 'GET') {
    const triggers = [...pendingTriggers]
    pendingTriggers = [] // Clear after reading
    return res.status(200).json({ triggers })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
