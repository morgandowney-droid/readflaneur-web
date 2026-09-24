/** Central AI model IDs - update here when providers release new models.
 *  Last reviewed: 2026-02-18
 *  Review schedule: Monthly (1st of each month)
 *  Provider docs:
 *    Anthropic: https://docs.anthropic.com/en/docs/about-claude/models
 *    Gemini:    https://ai.google.dev/gemini-api/docs/models
 *    Imagen:    https://ai.google.dev/gemini-api/docs/imagen
 *    Grok/xAI:  https://docs.x.ai/developers/models
 *
 *  Gemini Paid Tier 1 quotas (ai.dev/rate-limit):
 *    gemini-2.5-pro:   150 RPM, 1K RPD   - enrichment (first 900 RPD) + Sunday Edition (reserved 100 RPD)
 *    gemini-2.5-flash:  1K RPM, 10K RPD  - enrichment fallback + translation
 *    imagen-4.0:        ~500 RPD          - image library generation ($0.04/image)
 *    imagen-4.0-fast:   ~500 RPD          - image library generation ($0.02/image)
 */
export const AI_MODELS = {
  CLAUDE_SONNET: 'claude-sonnet-4-5-20250929',
  CLAUDE_HAIKU: 'claude-haiku-4-5-20251001',
  GEMINI_FLASH: 'gemini-2.5-flash',
  GEMINI_PRO: 'gemini-2.5-pro',
  GEMINI_IMAGE: 'gemini-3-pro-image-preview',
  IMAGEN: 'imagen-4.0-generate-001',
  IMAGEN_FAST: 'imagen-4.0-fast-generate-001',
  GROK_FAST: 'grok-4-1-fast',
  // Shadow model trial candidates only (src/lib/model-trial.ts). Nothing that
  // publishes uses these. Verified callable with our keys on 2026-09-24:
  // gemini-3.8-flash is the newest GA Gemini (no 3.x Pro is GA; 3.1 Pro is
  // preview), grok-4.5 is xAI's "minimal hallucinations" model.
  GEMINI_WRITER_TRIAL: 'gemini-3.8-flash',
  GROK_SEARCH_TRIAL: 'grok-4.5',
} as const;
