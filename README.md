# Technical Consistency Checker v3

Fixes `FUNCTION_PAYLOAD_TOO_LARGE`.

## What changed
- Browser uploads files directly to a **private Vercel Blob** store.
- Vercel Functions receive only small metadata objects, not the whole PDF.
- `/api/check` streams each private blob to Gemini Files API.
- Gemini 3.8 Flash performs the QA.
- Temporary Gemini files and Vercel Blob uploads are deleted after each check.

## Required Vercel environment variables
- `GEMINI_API_KEY` (already configured)
- `BLOB_READ_WRITE_TOKEN` (created automatically when you create/connect a Vercel Blob store)

## One-time Vercel setup
1. Open your Vercel project.
2. Storage -> Create Database -> Blob.
3. Choose **Private**.
4. Connect it to this project.
5. Vercel adds `BLOB_READ_WRITE_TOKEN`.
6. Redeploy.

## Supported files
PDF, PNG, JPG/JPEG, WEBP, TXT/MD.
Maximum per file in this starter: 50 MB.

## Model
Defaults to `gemini-3.8-flash`.
Optional environment override: `GEMINI_MODEL`.
