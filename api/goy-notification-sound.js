const OPENAI_SPEECH_URL = 'https://api.openai.com/v1/audio/speech';

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'OPENAI_API_KEY no está configurada' });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(OPENAI_SPEECH_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini-tts',
        voice: 'coral',
        input: 'GOY... goy, goy!',
        instructions: 'Create a very short branded notification sting in Spanish pronunciation. Say GOY clearly and confidently, then two faster playful repetitions: goy, goy. Energetic, modern, friendly logistics brand. Crisp diction, punchy rhythm, slight upward finish, no extra words, about one second if possible.',
        response_format: 'mp3',
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.error('GOY TTS error', response.status, detail.slice(0, 500));
      return res.status(502).json({ error: 'No se pudo generar la firma sonora GOY' });
    }

    const audio = Buffer.from(await response.arrayBuffer());
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', String(audio.length));
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=31536000, stale-while-revalidate=86400');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.status(200).send(audio);
  } catch (error) {
    if (error?.name === 'AbortError') {
      return res.status(504).json({ error: 'La generación del sonido tardó demasiado' });
    }
    console.error('GOY notification sound error', error);
    return res.status(500).json({ error: 'Error generando la firma sonora GOY' });
  } finally {
    clearTimeout(timeout);
  }
};
