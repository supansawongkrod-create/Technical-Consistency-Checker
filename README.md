# Technical Consistency Checker v5 — PPTX support

This version adds `.pptx` support without sending PowerPoint directly to Gemini.

## PPTX behavior
- The browser reads the PPTX locally.
- Slide text is extracted slide-by-slide.
- The extracted text is uploaded as a temporary private text file.
- Gemini compares that text with the other references/material.

This is intentionally conservative. Gemini's native document vision is strongest for PDF.
If visual layout, diagrams, product images, ports, or icons inside a PowerPoint must be checked,
export that PowerPoint to PDF before uploading for the highest QA quality.

## Other inputs
PDF / PNG / JPG / WEBP continue to be analyzed visually.

## Environment
- `GEMINI_API_KEY`
- Private Vercel Blob store connected via Vercel OIDC.

No `BLOB_READ_WRITE_TOKEN` required.
