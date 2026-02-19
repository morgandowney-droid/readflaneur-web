/**
 * Age band utilities for the Family Corner feature.
 * Children's ages auto-adjust based on birth month/year.
 */

export type AgeBand = 'infant' | 'toddler' | 'school_age' | 'teen';

export interface AgeBandDef {
  band: AgeBand;
  label: string;
  minMonths: number;
  maxMonths: number;
  contentFocus: string;
}

export const AGE_BAND_DEFS: AgeBandDef[] = [
  { band: 'infant', label: 'Infant (0-18mo)', minMonths: 0, maxMonths: 18, contentFocus: 'Mommy groups, baby swim, stroller-friendly venues' },
  { band: 'toddler', label: 'Toddler (19mo-5yr)', minMonths: 19, maxMonths: 71, contentFocus: 'Storytimes, playground openings, preschool enrollment' },
  { band: 'school_age', label: 'School Age (5-12yr)', minMonths: 60, maxMonths: 155, contentFocus: 'After-school programs, kids\' concerts, sports leagues' },
  { band: 'teen', label: 'Teen (13-18yr)', minMonths: 156, maxMonths: 227, contentFocus: 'Youth volunteer, teen workshops, school events' },
];

/**
 * Calculate age band for a child based on birth month/year.
 * Returns null if child is older than 18 (aged out).
 */
export function calculateAgeBand(
  birthMonth: number,
  birthYear: number,
  referenceDate: Date = new Date()
): AgeBand | null {
  const refYear = referenceDate.getFullYear();
  const refMonth = referenceDate.getMonth() + 1; // 1-indexed

  const ageInMonths = (refYear - birthYear) * 12 + (refMonth - birthMonth);

  if (ageInMonths < 0) return 'infant'; // Not born yet, treat as infant
  if (ageInMonths <= 18) return 'infant';
  if (ageInMonths <= 71) return 'toddler';
  if (ageInMonths <= 155) return 'school_age';
  if (ageInMonths <= 227) return 'teen';
  return null; // Aged out (>18 years)
}

/**
 * Get unique, sorted age bands from a list of children.
 * Used as the dedup key for cached content.
 */
export function getUniqueBands(
  children: { birth_month: number; birth_year: number }[],
  referenceDate: Date = new Date()
): AgeBand[] {
  const bands = new Set<AgeBand>();
  for (const child of children) {
    const band = calculateAgeBand(child.birth_month, child.birth_year, referenceDate);
    if (band) bands.add(band);
  }
  const order: AgeBand[] = ['infant', 'toddler', 'school_age', 'teen'];
  return order.filter(b => bands.has(b));
}

/**
 * Get human-readable label for an age band.
 */
export function getBandLabel(band: AgeBand): string {
  return AGE_BAND_DEFS.find(d => d.band === band)?.label || band;
}

/**
 * Get content focus description for age bands.
 */
export function getBandContentFocus(bands: AgeBand[]): string {
  return bands
    .map(b => AGE_BAND_DEFS.find(d => d.band === b)?.contentFocus || '')
    .filter(Boolean)
    .join('; ');
}
