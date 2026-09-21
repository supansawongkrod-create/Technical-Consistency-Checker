# Technical Consistency Checker - Gemini Free Tier v2

This version checks two things:

1. Product consistency against uploaded Sales Guides / Datasheets / Specs.
2. Clear technical reality / stable standards, even when the claim is not present in the uploaded references.

Important:
- Missing from the Sales Guide is NOT automatically an error.
- Added claims are allowed if technically valid.
- Added claims are flagged only when they are clearly false/impossible.
- Product-specific outside knowledge is not guessed.
- Only confirmed errors are displayed.

## Vercel environment variable
GEMINI_API_KEY = your Google AI Studio API key

Optional:
GEMINI_MODEL = gemini-2.5-flash
