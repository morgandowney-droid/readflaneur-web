/**
 * Fixed sensitivity rules shared by the editor desk (story-flags.ts, which only
 * flags) and the per-publisher edition rules (edition-rules.ts, which decides
 * what publishes). One definition, so the two cannot drift.
 *
 * Pure: no imports, so scripts can compile and test it on its own.
 */

export type SensitiveRuleHit = 'crime-or-court' | 'death-or-injury' | 'minors';

// Deliberately broad: a false flag costs an editor five seconds, a missed one
// can cost a defamation claim. English first because enrichment writes English;
// the German terms catch local names and quoted phrases.
export const CRIME_OR_COURT = /\b(police|polizei|arrest(ed|s)?|charged with|suspects?|court (case|hearing|ruling|date)|in court|(district|regional|supreme|high|appeals?|criminal) court|landesgericht|bezirksgericht|trial|prosecut\w*|staatsanwalt\w*|murder\w*|homicide|manslaughter|stabb(ed|ing)|assault\w*|robber(y|ies)|burglar(y|ies)|fraud|rape|sexual (assault|abuse)|shooting)\b/i;
// Not bare "dead" or "death": on the first Vorarlberg desk a concert by the band
// Sweeping Death came out as needing a legal check. The phrases below are how a
// real death or injury is reported. Same for bare "crash" ("crash course").
export const DEATH_OR_INJURY = /\b(died|dies|killed|deaths|death of|death toll|(found|was|were|is) dead|fatal(ly|ity)?|body (was )?found|verstorben|t[öo]dlich\w*|injur(ed|ies|y)|verletzt\w*|hospitali[sz]ed|accident|unfall|crashed|car crash|collision)\b/i;
export const MINORS = /\b(child|children|minors?|teen(ager)?s?|pupils?|schoolchildren|jugendlich\w*)\b/i;

/** Fixed rules. Minors only counts alongside crime or injury, or every children's event would be flagged. */
export function sensitiveRuleHits(story: { title: string; summary: string }): SensitiveRuleHit[] {
  const text = `${story.title}\n${story.summary}`;
  const hits: SensitiveRuleHit[] = [];
  if (CRIME_OR_COURT.test(text)) hits.push('crime-or-court');
  if (DEATH_OR_INJURY.test(text)) hits.push('death-or-injury');
  if (hits.length && MINORS.test(text)) hits.push('minors');
  return hits;
}
