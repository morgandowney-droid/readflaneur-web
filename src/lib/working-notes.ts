/**
 * The writer's working notes leaking into a published sentence.
 *
 * Shreveport, 12 Oct 2026, in a live brief:
 *
 *   "While specific specials for the eight local restaurants mentioned in the
 *    prompt couldn't be independently verified, it's the perfect day to visit
 *    your favorite Cajun or Creole spot for a bowl."
 *
 * Not a refusal (model-refusal.ts) and not planning prose ahead of the brief
 * (stripThinkingPreamble): one clause in the middle of good copy, talking to
 * us about its inputs. The reader should never hear about the prompt, the
 * provided sources or what the writer could not check.
 *
 * Fix per sentence. When the leak sits in a leading "While/Although ..., "
 * clause, keep the main clause ("It's the perfect day to visit..."); otherwise
 * drop the sentence. A paragraph left empty is dropped.
 */

/** References to our own inputs. Each is meaningless to a reader. */
const INPUT_REFERENCE = new RegExp(
  [
    String.raw`\b(?:mentioned|listed|provided|given|included|named|supplied|cited) in (?:the|your|my) (?:prompt|instructions|input|context|notes|brief(?:ing)?|source material|search results|research)\b`,
    String.raw`\bthe (?:prompt|provided (?:sources?|context|information|material|text|notes|data|links)|source material|input (?:data|text)|search results|research notes)\b`,
    String.raw`\b(?:based on|according to|from) the (?:provided|available|supplied|given) (?:information|sources?|material|data|context)\b`,
    String.raw`\b(?:i|we) (?:could not|couldn't|was unable to|were unable to|cannot|can't|did not|didn't) (?:find|verify|confirm|locate|independently verify)\b`,
    String.raw`\b(?:is|are|was|were) not (?:specified|mentioned|provided|included|detailed) in the (?:sources?|information|material|context|research)\b`,
    String.raw`\bas of my (?:last|knowledge)\b`,
  ].join('|'),
  'i',
);

const LEADING_CLAUSE = /^(\s*[*_]*)(?:while|although|though|since|as|because|even though|whilst)\b[^,]*,\s*(.+)$/i;

/** True when the text contains a reference to the writer's inputs. */
export function hasWorkingNotes(text: string | null | undefined): boolean {
  // Ignore link targets: a URL can contain "the-prompt".
  return !!text && INPUT_REFERENCE.test(text.replace(/\]\([^)]*\)/g, ']'));
}

/** Remove working-note sentences. Returns the text and what was removed. */
export function stripWorkingNotes(text: string): { text: string; removed: string[] } {
  if (!hasWorkingNotes(text)) return { text, removed: [] };
  const removed: string[] = [];
  const cleanLine = (line: string): string => {
    if (/^\s*\[\[/.test(line) || !hasWorkingNotes(line)) return line;
    return line
      .split(/(?<=[.!?])\s+(?=[A-Z\[*"'])/)
      .map((s) => {
        if (!hasWorkingNotes(s)) return s;
        const lead = s.match(LEADING_CLAUSE);
        if (lead && !hasWorkingNotes(lead[2])) {
          removed.push(s.slice(0, s.length - lead[2].length).trim());
          return lead[1] + lead[2].charAt(0).toUpperCase() + lead[2].slice(1);
        }
        removed.push(s.trim());
        return '';
      })
      .filter((s) => s.trim() !== '')
      .join(' ');
  };
  // Line by line, remembering which lines the removal emptied, so a [[header]]
  // is dropped only when its own section was emptied by us.
  const lines = text.split('\n');
  const cleaned = lines.map(cleanLine);
  const isHeader = (l: string) => /^\s*\[\[[^\]]+\]\]\s*$/.test(l);
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() !== '' && cleaned[i].trim() === '') continue; // emptied by us
    if (isHeader(lines[i])) {
      // The header's section is every line up to the next header.
      let hadBody = false;
      let keepsBody = false;
      for (let j = i + 1; j < lines.length && !isHeader(lines[j]); j++) {
        if (lines[j].trim()) hadBody = true;
        if (cleaned[j].trim()) keepsBody = true;
      }
      if (hadBody && !keepsBody) continue;
    }
    out.push(cleaned[i]);
  }
  return { text: out.join('\n').replace(/\n{3,}/g, '\n\n').trim(), removed };
}
