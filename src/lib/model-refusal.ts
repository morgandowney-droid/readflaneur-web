/**
 * Detecting the model talking ABOUT the task instead of doing it.
 *
 * A Charters Towers Look Ahead published with this as its entire body:
 *
 *   "I am sorry, but I cannot fulfill your request to create a newsletter for
 *    Charters Towers. The critical context states that there are 'No confirmed
 *    events...'. My instructions explicitly state: 'CRITICAL: ONLY include
 *    events you can verify with a real source...'"
 *
 * The model declining the job, published under a masthead, quoting its own
 * system prompt back to the reader. Nothing errored: the pipeline had a string,
 * the string was long enough, and it wrote it to `articles`.
 *
 * Every generation path that writes to `articles` needs this, not only the one
 * where it has already happened. Same family as stripThinkingPreamble, except a
 * thinking leak is embarrassing and this one hands over the prompt.
 */

/**
 * First-person meta-commentary. Anchored to the opening of the text, because a
 * genuine brief can quote a councillor saying "I am sorry" halfway down and
 * that is not a refusal.
 */
const REFUSAL_OPENING =
  /^[\s>*_#-]*(?:i(?:'m| am)\s+(?:sorry|afraid|unable)|i\s+(?:cannot|can't|can not|won't|will not|am not able)|unfortunately,?\s+i|as an ai\b|i'?m an ai\b|sorry,?\s+(?:but\s+)?i)/i;

/** Phrases that betray the prompt itself, wherever they appear. */
const PROMPT_LEAK =
  /\b(?:my instructions (?:explicitly )?(?:state|say)|the (?:critical )?context states|per my instructions|the system prompt|as an ai (?:language )?model|i cannot fulfill|i'm unable to (?:generate|create|fulfill)|cannot fulfil(?:l)? (?:your|this) request)\b/i;

/**
 * True when the text is the model refusing or explaining rather than writing.
 * Checks the opening for first-person meta and the whole body for prompt leaks.
 */
export function isModelRefusal(text: string | null | undefined): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  if (!trimmed) return false;
  // Look at the first couple of sentences for the refusal opening; a refusal
  // always leads with it rather than burying it.
  const opening = trimmed.slice(0, 400);
  return REFUSAL_OPENING.test(opening) || PROMPT_LEAK.test(trimmed);
}

/**
 * Passive "nothing happened" framing. The ENERGY RULES already ban this in
 * headlines; this catches it when it becomes the body instead.
 */
export const EMPTY_EDITION =
  /no confirmed events|no events (?:scheduled|found|listed)|nothing (?:major|much) (?:happening|going on|scheduled)|quiet (?:week|day|weekend|friday)|slow (?:week|day)|not much going on/i;

/**
 * The single question every insert should ask: is this publishable at all?
 * Returns a reason string when it is not, so the caller can log why.
 */
export function unpublishableReason(
  body: string | null | undefined,
  opts: { minWords?: number } = {},
): string | null {
  const minWords = opts.minWords ?? 40;
  const text = (body || '').trim();
  if (!text) return 'empty body';
  if (isModelRefusal(text)) return 'model refusal or prompt leak';
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words < minWords) return `body too short (${words} words, minimum ${minWords})`;
  if (EMPTY_EDITION.test(text.slice(0, 200))) return 'body opens with empty-edition framing';
  return null;
}
