const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

function mimeOf(f) {
  const n = (f.name || "").toLowerCase();
  if (f.type && f.type !== "application/octet-stream") return f.type;
  if (n.endsWith(".pdf")) return "application/pdf";
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
  if (n.endsWith(".webp")) return "image/webp";
  if (n.endsWith(".txt") || n.endsWith(".md")) return "text/plain";
  return "application/octet-stream";
}

function supported(f) {
  const m = mimeOf(f);
  return m === "application/pdf" || m.startsWith("image/") || m === "text/plain";
}

function filePart(f) {
  return { inline_data: { mime_type: mimeOf(f), data: f.data } };
}

function stripFence(s) {
  return String(s || "").trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: "GEMINI_API_KEY is not configured in Vercel." });

  try {
    const { references, material } = req.body || {};
    if (!Array.isArray(references) || !references.length || !material) {
      return res.status(400).json({ error: "Reference document(s) and one material are required." });
    }

    const all = [...references, material];
    const bad = all.filter(f => !supported(f));
    if (bad.length) {
      return res.status(400).json({
        error: "This free version supports PDF, JPG/JPEG, PNG, WEBP, TXT and MD. Unsupported: " +
          bad.map(x => x.name).join(", ")
      });
    }

    const prompt = `
You are a strict product technical-consistency QA reviewer.

SOURCES OF TRUTH
Use two evidence layers:

A) PRODUCT-SPECIFIC FACTS
For product-specific values or capabilities (model class, port count, supported features,
battery capacity, dimensions, app support, included accessories, etc.), use the uploaded
REFERENCE documents as the authoritative source.

B) GENERAL TECHNICAL REALITY
You may also flag a claim when it is clearly false or technically impossible based on stable,
well-established technical facts or standards, even if that item is not mentioned in the
uploaded references. Examples include a clearly wrong Wi-Fi generation/IEEE mapping,
an impossible connector/interface relationship, or a standard/technology label that is
objectively incompatible with what is shown.

Do NOT use uncertain, product-specific outside knowledge to invent a mismatch.

TASK
Inspect the entire MATERIAL TO REVIEW, including visible text, numbers, icons,
identifiable standards/technology marks, ports/connectors, devices, diagrams,
labels, Wi-Fi classes, connection examples, and technically implied relationships.
Compare them against the uploaded references and against clear general technical reality.

REPORT ONLY CONFIRMED ERRORS
Report an issue when EITHER:
1) the material clearly contradicts an uploaded reference, OR
2) the material is clearly technically false/impossible based on stable, well-established
   technical facts or standards.

DO NOT REPORT
- a claim merely because it is absent from the references
- unclear or unreadable elements
- ambiguous interpretations
- conflicts between reference documents
- subjective marketing wording
- suggestions or improvements
- consistent items
- uncertain outside knowledge
- product-specific assumptions not established by the references

If uncertain, omit it. False positives are worse than missed issues.

Return ONLY valid JSON:
{
  "issues": [
    {
      "location": "where in the material",
      "evidence": "exact visible material evidence",
      "why_incorrect": "concise explanation tied to the uploaded references",
      "should_be": "correct value or relationship explicitly supported by the references"
    }
  ]
}

If there are no confirmed errors, return {"issues":[]}.
`.trim();

    const parts = [{ text: prompt }];

    references.forEach((f, i) => {
      parts.push({ text: `REFERENCE ${i + 1}: ${f.name}` });
      parts.push(filePart(f));
    });

    parts.push({ text: `MATERIAL TO REVIEW: ${material.name}` });
    parts.push(filePart(material));

    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const url = `${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;

    const gr = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json"
        }
      })
    });

    const raw = await gr.json().catch(() => ({}));
    if (!gr.ok) {
      return res.status(gr.status).json({
        error: raw?.error?.message || `Gemini API error (${gr.status})`
      });
    }

    const text = (raw?.candidates?.[0]?.content?.parts || [])
      .map(p => p.text || "").join("").trim();

    let parsed;
    try { parsed = JSON.parse(stripFence(text)); }
    catch {
      return res.status(502).json({ error: "Gemini returned an unexpected format. Please run the check again." });
    }

    const issues = Array.isArray(parsed.issues)
      ? parsed.issues.filter(x => x && x.location && x.evidence && x.why_incorrect && x.should_be)
      : [];

    return res.status(200).json({ issues });
  } catch (e) {
    return res.status(500).json({ error: e?.message || String(e) });
  }
}
