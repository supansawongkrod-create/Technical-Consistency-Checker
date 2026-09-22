const GEMINI_UPLOAD_START = 'https://generativelanguage.googleapis.com/upload/v1beta/files';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return res.status(500).json({ error: 'GEMINI_API_KEY is not configured in Vercel.' });
  }

  try {
    const { name, type, size } = req.body || {};
    if (!name || !type || !Number.isFinite(size) || size <= 0) {
      return res.status(400).json({ error: 'Missing file metadata.' });
    }

    const allowed = new Set([
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/webp',
      'text/plain'
    ]);
    if (!allowed.has(type)) {
      return res.status(400).json({ error: `Unsupported file type: ${type}` });
    }

    // Keep the starter conservative.
    const max = 50 * 1024 * 1024;
    if (size > max) {
      return res.status(400).json({ error: 'File exceeds 50 MB.' });
    }

    const r = await fetch(GEMINI_UPLOAD_START, {
      method: 'POST',
      headers: {
        'x-goog-api-key': key,
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(size),
        'X-Goog-Upload-Header-Content-Type': type,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ file: { display_name: name } })
    });

    const text = await r.text();
    if (!r.ok) {
      return res.status(r.status).json({
        error: `Gemini upload start failed: ${text.slice(0, 300)}`
      });
    }

    let uploadUrl = r.headers.get('x-goog-upload-url');
    if (!uploadUrl) {
      return res.status(502).json({ error: 'Gemini did not return an upload URL.' });
    }

    // Gemini may return a relative resumable-upload URL.
    // Normalize it so the browser does not resolve it against the Vercel domain.
    if (uploadUrl.startsWith('/')) {
      uploadUrl = `https://generativelanguage.googleapis.com${uploadUrl}`;
    } else if (!/^https?:\/\//i.test(uploadUrl)) {
      uploadUrl = `https://generativelanguage.googleapis.com/${uploadUrl.replace(/^\/+/, '')}`;
    }

    return res.status(200).json({ uploadUrl });
  } catch (e) {
    return res.status(500).json({ error: e?.message || String(e) });
  }
}
