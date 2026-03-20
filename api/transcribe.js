export const config = { api: { bodyParser: false } }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const ASSEMBLYAI_KEY = process.env.ASSEMBLYAI_KEY

  try {
    const action = req.headers['x-action']

    if (action === 'upload') {
      // Collect raw body
      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      const buffer = Buffer.concat(chunks)

      const uploadRes = await fetch('https://api.assemblyai.com/v2/upload', {
        method: 'POST',
        headers: { authorization: ASSEMBLYAI_KEY, 'content-type': 'application/octet-stream' },
        body: buffer
      })
      const data = await uploadRes.json()
      return res.status(200).json(data)
    }

    if (action === 'transcribe') {
      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      const body = JSON.parse(Buffer.concat(chunks).toString())

      const transcriptRes = await fetch('https://api.assemblyai.com/v2/transcript', {
        method: 'POST',
        headers: { authorization: ASSEMBLYAI_KEY, 'content-type': 'application/json' },
        body: JSON.stringify({ audio_url: body.audio_url })
      })
      const data = await transcriptRes.json()
      return res.status(200).json(data)
    }

    if (action === 'poll') {
      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      const body = JSON.parse(Buffer.concat(chunks).toString())

      const pollRes = await fetch(`https://api.assemblyai.com/v2/transcript/${body.id}`, {
        headers: { authorization: ASSEMBLYAI_KEY }
      })
      const data = await pollRes.json()
      return res.status(200).json(data)
    }

    return res.status(400).json({ error: 'Unknown action' })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
