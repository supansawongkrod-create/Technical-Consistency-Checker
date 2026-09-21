const GEMINI_BASE = 'https://generativelanguage.googleapis.com';

function stripFence(s) {
  return String(s || '').trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
}

async function deleteGeminiFile(fileName, key) {
  if (!fileName) return;
  try {
    await fetch(`${GEMINI_BASE}/v1beta/${fileName}`, {
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

  const all = [...references, material];

  try {
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
      parts.push({ text: `REFERENCE ${i + 1}: ${r.name}` });
      parts.push({
        file_data: {
          mime_type: r.type,
          file_uri: r.uri
        }
      });
    });

    parts.push({ text: `MATERIAL TO REVIEW: ${material.name}` });
    parts.push({
      file_data: {
        mime_type: material.type,
        file_uri: material.uri
      }
    });

    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

    const gr = await fetch(
      `${GEMINI_BASE}/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method:'POST',
        headers:{
          'x-goog-api-key':key,
          'Content-Type':'application/json'
        },
        body:JSON.stringify({
          contents:[{role:'user',parts}],
          generationConfig:{
            temperature:0,
            responseMimeType:'application/json'
          }
        })
      }
    );

    const raw = await gr.json().catch(() => ({}));
    if(!gr.ok){
      return res.status(gr.status).json({
        error: raw?.error?.message || `Gemini API error (${gr.status})`
      });
    }

    const text = (raw?.candidates?.[0]?.content?.parts || [])
      .map(p => p.text || '')
      .join('')
      .trim();

    let parsed;
    try { parsed = JSON.parse(stripFence(text)); }
    catch {
      return res.status(502).json({
        error:'Gemini returned an unexpected response format. Please run the check again.'
      });
    }

    const issues = Array.isArray(parsed.issues)
      ? parsed.issues.filter(x =>
          x && x.location && x.evidence && x.why_incorrect && x.should_be
        )
      : [];

    return res.status(200).json({ issues });
  } catch(e) {
    return res.status(500).json({ error:e?.message || String(e) });
  } finally {
    await Promise.allSettled(
      all.map(f => deleteGeminiFile(f.fileName, key))
    );
  }
}
