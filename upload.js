import { issueSignedToken, presignUrl } from '@vercel/blob';

const ALLOWED_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'text/plain'
]);

function safeName(name = 'file') {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  try {
    const { name, type, size } = req.body || {};
    if (!name || !type || !Number.isFinite(size)) {
      return res.status(400).json({ error: 'Missing file metadata.' });
    }

    if (!ALLOWED_TYPES.has(type)) {
      return res.status(400).json({ error: `Unsupported file type: ${type}` });
    }

    const max = 50 * 1024 * 1024;
    if (size > max) {
      return res.status(400).json({ error: 'File exceeds 50 MB.' });
    }

    const pathname = `qa/${Date.now()}-${crypto.randomUUID()}-${safeName(name)}`;
    const validUntil = Date.now() + 15 * 60 * 1000;

    const token = await issueSignedToken({
      pathname,
      operations: ['put'],
      allowedContentTypes: [type],
      maximumSizeInBytes: max,
      validUntil
    });

    const { presignedUrl } = await presignUrl(token, {
      pathname,
      operation: 'put',
      validUntil
    });

    return res.status(200).json({ pathname, presignedUrl });
  } catch (error) {
    return res.status(500).json({ error: error?.message || String(error) });
  }
}
