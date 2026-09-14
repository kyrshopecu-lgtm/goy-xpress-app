const OPENAI_SPEECH_URL = 'https://api.openai.com/v1/audio/speech';

function createFallbackWav() {
  const sampleRate = 16000;
  const duration = 0.42;
  const samples = Math.floor(sampleRate * duration);
  const data = Buffer.alloc(samples * 2);

  for (let i = 0; i < samples; i += 1) {
    const t = i / sampleRate;
    const freq = t < 0.14 ? 659.25 : t < 0.28 ? 783.99 : 987.77;
    const attack = Math.min(1, t / 0.015);
    const release = Math.min(1, (duration - t) / 0.06);
    const envelope = Math.max(0, Math.min(attack, release));
    const value = Math.sin(2 * Math.PI * freq * t) * envelope * 0.22;
    data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(value * 32767))), i * 2);
  }

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

function sendFallback(res, reason) {
  const audio = createFallbackWav();
  if (reason) console.warn('GOY notification fallback:', reason);
  res.setHeader('Content-Type', 'audio/wav');
  res.setHeader('Content-Length', String(audio.length));
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=3600');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-GOY-Audio-Fallback', '1');
  return res.status(200).send(audio);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return sendFallback(res, 'OPENAI_API_KEY no configurada');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

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
      console.warn('GOY TTS unavailable', response.status, detail.slice(0, 300));
      return sendFallback(res, `TTS upstream ${response.status}`);
    }

    const audio = Buffer.from(await response.arrayBuffer());
    if (!audio.length) return sendFallback(res, 'TTS devolvió audio vacío');

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', String(audio.length));
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=31536000, stale-while-revalidate=86400');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.status(200).send(audio);
  } catch (error) {
    const reason = error?.name === 'AbortError' ? 'timeout de TTS' : (error?.message || 'error desconocido');
    return sendFallback(res, reason);
  } finally {
    clearTimeout(timeout);
  }
};
