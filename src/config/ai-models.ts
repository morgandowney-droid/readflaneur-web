/** Central AI model IDs - update here when providers release new models.
 *  Last reviewed: 2026-02-10
 *  Review schedule: Monthly (1st of each month)
 *  Provider docs:
 *    Anthropic: https://docs.anthropic.com/en/docs/about-claude/models
 *    Gemini:    https://ai.google.dev/gemini-api/docs/models
 *    Grok/xAI:  https://docs.x.ai/developers/models
 */
export const AI_MODELS = {
  CLAUDE_SONNET: 'claude-sonnet-4-5-20250929',
  CLAUDE_HAIKU: 'claude-haiku-4-5-20251001',
  GEMINI_FLASH: 'gemini-2.5-flash',
  GEMINI_PRO: 'gemini-2.5-pro',
  GEMINI_IMAGE: 'gemini-3-pro-image-preview',
  GROK_FAST: 'grok-4-1-fast',
} as const;
