/**
 * Accent- and case-insensitive text folding, shared by story-to-page source
 * matching (source-links.ts) and the deterministic source check
 * (source-check.ts), so both compare text the same way.
 *
 * "Östermalm" -> "ostermalm", "Gaißau" -> "gaissau", "Chalk's Gallery" ->
 * "chalks gallery". Apostrophes are removed rather than turned into spaces so a
 * possessive matches with or without its apostrophe.
 */
export function foldText(s: string | null | undefined): string {
  return (s || '')
    .replace(/ß/g, 'ss')
    .replace(/[Ææ]/g, 'ae')
    .replace(/[Øø]/g, 'o')
    .replace(/[Łł]/g, 'l')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['‘’ʼ`´]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function foldTokens(s: string | null | undefined): string[] {
  const f = foldText(s);
  return f ? f.split(' ') : [];
}

/** Function words in the languages the editions publish or search in. */
export const FUNCTION_WORDS = new Set([
  // English
  'the', 'a', 'an', 'of', 'and', 'or', 'in', 'at', 'on', 'for', 'to', 'with', 'from', 'by', 'as', 'its', 'is', 'are',
  'this', 'that', 'into', 'over', 'near', 'new', 'old', 'up',
  // German
  'der', 'die', 'das', 'und', 'im', 'am', 'an', 'zum', 'zur', 'von', 'vom', 'mit', 'auf', 'fur', 'den', 'dem', 'des',
  'ein', 'eine', 'bei', 'nach', 'aus',
  // Romance
  'de', 'del', 'la', 'el', 'los', 'las', 'y', 'en', 'al', 'le', 'les', 'du', 'et', 'un', 'una', 'uno', 'il', 'lo',
  'gli', 'e', 'di', 'da', 'della', 'dello', 'dei', 'delle', 'nel', 'nella', 'sul', 'per', 'con', 'do', 'dos', 'das',
  'na', 'no', 'o', 'os', 'as', 'em', 'a', 'au', 'aux', 'sur', 'par',
]);

/** Singular/plural-insensitive token equality ("prices" ~ "price"). */
export function tokenStem(t: string): string {
  if (t.length > 4 && t.endsWith('ies')) return t.slice(0, -3) + 'y';
  if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss')) return t.slice(0, -1);
  return t;
}
