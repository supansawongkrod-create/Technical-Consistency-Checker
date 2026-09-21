import { get, del } from '@vercel/blob';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com';

function stripFence(s) {
  return String(s || '').trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
}

async function blobToGemini(meta, key) {
  const result = await get(meta.pathname, {
    access: 'private',
    useCache: false
  });

  if (!result || !result.stream || !result.blob) {
    throw new Error(`Could not read uploaded file: ${meta.name}`);
  }

  const mime = result.blob.contentType || meta.type || 'application/octet-stream';
  const size = result.blob.size || meta.size;

  const start = await fetch(`${GEMINI_BASE}/upload/v1beta/files`, {
    method: 'POST',
    headers: {
      'x-goog-api-key': key,
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(size),
      'X-Goog-Upload-Header-Content-Type': mime,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ file: { display_name: meta.name } })
  });

  if (!start.ok) {
    const t = await start.text();
    throw new Error(`Gemini upload start failed for ${meta.name}: ${t.slice(0,200)}`);
  }

  const uploadUrl = start.headers.get('x-goog-upload-url');
  if (!uploadUrl) throw new Error(`Gemini did not return an upload URL for ${meta.name}`);

  const up = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Length': String(size),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize'
    },
    body: result.stream,
    duplex: 'half'
  });

  const info = await up.json().catch(() => ({}));
  if (!up.ok || !info?.file?.uri) {
    throw new Error(`Gemini upload failed for ${meta.name}: ${info?.error?.message || up.status}`);
  }

  return info.file;
}

async function deleteGeminiFile(file, key) {
  if (!file?.name) return;
  try {
    await fetch(`${GEMINI_BASE}/v1beta/${file.name}`, {
      method: 'DELETE',
      headers: { 'x-goog-api-key': key }
    });
  } catch {}
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: 'GEMINI_API_KEY is not configured in Vercel.' });

  const { references, material } = req.body || {};
  if (!Array.isArray(references) || !references.length || !material) {
    return res.status(400).json({ error: 'Reference document(s) and one material are required.' });
  }

  const blobPaths = [...references, material].map(x => x.pathname).filter(Boolean);
  const gemFiles = [];

  try {
    for (const r of references) gemFiles.push(await blobToGemini(r, key));
    const matFile = await blobToGemini(material, key);
    gemFiles.push(matFile);

    const prompt = `
You are a strict product technical-consistency QA reviewer.

Use two evidence layers:

A) PRODUCT-SPECIFIC FACTS
For product-specific values or capabilities, use the uploaded REFERENCE documents as the authoritative source.

B) GENERAL TECHNICAL REALITY
You may also flag a claim when it is clearly false or technically impossible based on stable, well-established technical facts or standards, even if that item is not mentioned in the references.

Do not use uncertain product-specific outside knowledge to invent a mismatch.

Inspect the entire MATERIAL TO REVIEW, including visible text, numbers, icons, identifiable standards/technology marks, ports/connectors, devices, diagrams, labels, Wi-Fi classes, connection examples, and technically implied relationships.

REPORT ONLY CONFIRMED ERRORS:
1) clear conflict with uploaded reference evidence, OR
2) clearly technically false/impossible based on stable technical facts or standards.

DO NOT REPORT:
- claims merely absent from references
- unclear/unreadable items
- ambiguous interpretations
- conflicts between reference documents
- subjective marketing wording
- suggestions/improvements
- consistent items
- uncertain outside knowledge
- product-specific assumptions not established by references

If uncertain, omit it. False positives are worse than missed issues.

Return ONLY valid JSON:
{"issues":[{"location":"where in the material","evidence":"exact visible material evidence","why_incorrect":"concise explanation","should_be":"correct value/relationship"}]}

If none, return {"issues":[]}.
`.trim();

    const parts = [{ text: prompt }];
    references.forEach((r, i) => {
      const f = gemFiles[i];
      parts.push({ text: `REFERENCE ${i + 1}: ${r.name}` });
      parts.push({ file_data: { mime_type: f.mimeType || r.type, file_uri: f.uri } });
    });

    parts.push({ text: `MATERIAL TO REVIEW: ${material.name}` });
    parts.push({ file_data: { mime_type: matFile.mimeType || material.type, file_uri: matFile.uri } });

    const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
    const gr = await fetch(`${GEMINI_BASE}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: {
        'x-goog-api-key': key,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          temperature: 0,
          responseMimeType: 'application/json'
        }
      })
    });

    const raw = await gr.json().catch(() => ({}));
    if (!gr.ok) {
      throw new Error(raw?.error?.message || `Gemini API error (${gr.status})`);
    }

    const text = (raw?.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim();
    let parsed;
    try { parsed = JSON.parse(stripFence(text)); }
    catch { throw new Error('Gemini returned an unexpected response format. Please run the check again.'); }

    const issues = Array.isArray(parsed.issues)
      ? parsed.issues.filter(x => x && x.location && x.evidence && x.why_incorrect && x.should_be)
      : [];

    return res.status(200).json({ issues });
  } catch (e) {
    return res.status(500).json({ error: e?.message || String(e) });
  } finally {
    await Promise.allSettled(gemFiles.map(f => deleteGeminiFile(f, key)));
    if (blobPaths.length) {
      try { await del(blobPaths); } catch {}
    }
  }
}