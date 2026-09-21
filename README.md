# Technical Consistency Checker v4

This version fixes:
`Vercel Blob: Failed to retrieve the client token`

## What changed

The browser no longer uses `@vercel/blob/client`.

New flow:
1. Browser asks `/api/upload` for a short-lived signed PUT URL.
2. `/api/upload` authenticates to the private Blob store using Vercel OIDC.
3. Browser uploads the file directly to the signed URL.
4. `/api/check` reads the private blob and sends it to Gemini.
5. Temporary files are deleted after the check.

This avoids:
- Vercel Function payload limits
- `BLOB_READ_WRITE_TOKEN`
- client-token retrieval errors

## Required environment variables

- `GEMINI_API_KEY`

No `BLOB_READ_WRITE_TOKEN` is required for a new Private Blob store using OIDC.

## Required project setup

Your Private Blob store must be connected to this Vercel project.

## Supported files

- PDF
- PNG
- JPG/JPEG
- WEBP
- TXT / MD

Maximum size in this starter: 50 MB per file.
