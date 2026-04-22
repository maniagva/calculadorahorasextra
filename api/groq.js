/**
 * api/groq.js
 * Vercel Serverless Function – Proxy hacia Groq API.
 *
 * La API key se configura como variable de entorno en Vercel:
 *   GROQ_API_KEY=gsk_...
 *
 * El frontend llama a /api/groq en lugar de llamar a Groq directamente,
 * por lo que la clave nunca queda expuesta en el código fuente.
 */

export default async function handler(req, res) {
  // Solo permitir POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GROQ_API_KEY no configurada en el servidor.' });
  }

  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(req.body),
    });

    const data = await groqRes.json();
    return res.status(groqRes.status).json(data);
  } catch (err) {
    console.error('Groq proxy error:', err);
    return res.status(500).json({ error: err.message });
  }
}
