/**
 * Section labels are fixed terms, not prose.
 *
 * Article headlines carry one of three section labels, built in the pipeline as:
 *   `${neighborhood.name} DAILY BRIEF: ${teaser}`   (generate-brief-articles, assembler)
 *   `LOOK AHEAD: ${teaser}`                          (generate-look-ahead)
 *   `The Sunday Edition: ${neighborhood.name}`       (sync-weekly-brief)
 *
 * Handing those labels to the translator produces a different name for the same
 * section every day. The German pilot editions carried VORAUSSCHAU, VORAUSBLICK
 * and VORAUSGESCHAUT across four days (the last is a past participle, not a noun),
 * while "DAILY BRIEF" was left in English inside otherwise German headlines.
 *
 * Same rule as the British register work: asking the model reduces the error, a
 * deterministic substitution removes it. The label is parked before translation
 * and restored from this table afterwards, so the model never sees it as text to
 * render. One table, so a publisher can be given its own wording in one place.
 */
export type SectionLabelKind = 'daily_brief' | 'look_ahead' | 'sunday_edition';

/**
 * Lives here rather than in translation-service so this module has no imports
 * and the backfill script can compile it on its own, importing the shipped table
 * instead of copying it. translation-service re-exports the type.
 */
export type LanguageCode = 'sv' | 'fr' | 'de' | 'es' | 'pt' | 'it' | 'zh' | 'ja';

const SECTION_LABELS: Record<LanguageCode, Record<SectionLabelKind, string>> = {
  sv: { daily_brief: 'DAGENS ÖVERSIKT', look_ahead: 'PÅ GÅNG', sunday_edition: 'Söndagsutgåvan' },
  fr: { daily_brief: 'LE BRIEF DU JOUR', look_ahead: 'À VENIR', sunday_edition: "L'Édition du Dimanche" },
  de: { daily_brief: 'TAGESBRIEFING', look_ahead: 'VORSCHAU', sunday_edition: 'Die Sonntagsausgabe' },
  es: { daily_brief: 'RESUMEN DIARIO', look_ahead: 'PRÓXIMAMENTE', sunday_edition: 'La Edición Dominical' },
  pt: { daily_brief: 'RESUMO DIÁRIO', look_ahead: 'EM BREVE', sunday_edition: 'A Edição de Domingo' },
  it: { daily_brief: 'IL PUNTO DEL GIORNO', look_ahead: 'IN ARRIVO', sunday_edition: "L'Edizione Domenicale" },
  zh: { daily_brief: '每日简报', look_ahead: '近期预告', sunday_edition: '周日特刊' },
  ja: { daily_brief: 'デイリーブリーフ', look_ahead: '今後の予定', sunday_edition: '日曜版' },
};

type ParsedHeadline =
  | { kind: 'daily_brief'; place: string; rest: string }
  | { kind: 'look_ahead'; rest: string }
  | { kind: 'sunday_edition'; place: string };

/** Identify the section label on an English headline. Returns null for ordinary articles. */
export function parseSectionLabel(englishHeadline: string): ParsedHeadline | null {
  const headline = englishHeadline.trim();

  const sunday = headline.match(/^The Sunday Edition:\s*(.+)$/i);
  if (sunday) return { kind: 'sunday_edition', place: sunday[1].trim() };

  const lookAhead = headline.match(/^LOOK\s*AHEAD:\s*(.+)$/i);
  if (lookAhead) return { kind: 'look_ahead', rest: lookAhead[1].trim() };

  const daily = headline.match(/^(.*?)\s+DAILY\s*BRIEF:\s*(.+)$/i);
  if (daily) return { kind: 'daily_brief', place: daily[1].trim(), rest: daily[2].trim() };

  return null;
}

/**
 * Drop whatever label prefix the model produced and return the translated teaser.
 *
 * The label separator is always the first colon, so anything before it goes. The
 * 60-character cap stops a headline with no label but a colon deep in a real
 * sentence from being truncated.
 */
function stripTranslatedLabel(translatedHeadline: string): string {
  const headline = translatedHeadline.trim();
  const colon = headline.search(/[:：]/);
  if (colon === -1 || colon > 60) return headline;
  return headline.slice(colon + 1).trim() || headline;
}

/**
 * Build a headline from a parsed English original and an already-label-free
 * translated teaser. This is the path used when the label was parked before
 * translation, so the teaser is taken verbatim and a colon inside it survives.
 *
 * Place names come from the English original rather than the translation: they
 * are proper nouns and must not drift.
 */
export function buildTranslatedHeadline(
  parsed: ParsedHeadline,
  translatedRest: string,
  lang: LanguageCode,
): string {
  const labels = SECTION_LABELS[lang];
  const rest = translatedRest.trim() || (parsed.kind === 'sunday_edition' ? parsed.place : parsed.rest);

  if (parsed.kind === 'sunday_edition') return `${labels.sunday_edition}: ${parsed.place}`;
  if (parsed.kind === 'look_ahead') return `${labels.look_ahead}: ${rest}`;
  return `${parsed.place} ${labels.daily_brief}: ${rest}`;
}

/**
 * Restore the canonical section label on a headline that still carries whatever
 * label the model produced. Used to repair rows translated before the label was
 * parked, where the teaser and the label share one string.
 */
export function enforceSectionLabel(
  englishHeadline: string,
  translatedHeadline: string,
  lang: LanguageCode,
): string {
  const parsed = parseSectionLabel(englishHeadline);
  if (!parsed) return translatedHeadline;
  if (!SECTION_LABELS[lang]) return translatedHeadline;

  if (parsed.kind === 'sunday_edition') {
    return buildTranslatedHeadline(parsed, '', lang);
  }
  return buildTranslatedHeadline(parsed, stripTranslatedLabel(translatedHeadline), lang);
}

/** Exposed for the backfill script and for tests. */
export function getSectionLabels(lang: LanguageCode): Record<SectionLabelKind, string> | null {
  return SECTION_LABELS[lang] ?? null;
}
