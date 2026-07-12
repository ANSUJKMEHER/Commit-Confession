// Vercel serverless function — stretch feature.
// POST { text } -> audio/mpeg binary

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST' })
  }

  const { text } = req.body || {}
  if (!text) {
    return res.status(400).json({ error: 'text is required' })
  }

  const voiceId = process.env.ELEVENLABS_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb'

  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: text.slice(0, 2500),
        model_id: 'eleven_flash_v2_5',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    })

    if (!r.ok) {
      const errText = await r.text()
      throw new Error(`ElevenLabs error: ${r.status} ${errText}`)
    }

    const buffer = Buffer.from(await r.arrayBuffer())
    res.setHeader('Content-Type', 'audio/mpeg')
    return res.status(200).send(buffer)
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: err.message })
  }
}
