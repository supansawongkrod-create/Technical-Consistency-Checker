import { handleUpload } from '@vercel/blob/client';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const jsonResponse = await handleUpload({
      body: req.body,
      request: req,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: [
          'application/pdf',
          'image/png',
          'image/jpeg',
          'image/webp',
          'text/plain'
        ],
        addRandomSuffix: true,
        maximumSizeInBytes: 50 * 1024 * 1024
      }),
      onUploadCompleted: async () => {}
    });
    return res.status(200).json(jsonResponse);
  } catch (error) {
    return res.status(400).json({ error: error?.message || String(error) });
  }
}
