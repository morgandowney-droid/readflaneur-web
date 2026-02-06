/**
 * Passionfroot Email Parser
 *
 * Extracts booking data from Passionfroot transaction emails.
 * Adaptive parsing — we don't know the exact email template,
 * so multiple extraction strategies are tried with fallback defaults.
 */

export interface ParsedBooking {
  clientName: string;
  clientEmail: string;
  productName: string;
  amount: number;
  needsDesign: boolean;
}

/** Strip HTML tags to get plain text */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|tr|li|h[1-6])[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Extract brand/client name from subject line */
function extractClientFromSubject(subject: string): string | null {
  // "New Booking: Brand x Flaneur" or "New Booking: Brand × Flaneur"
  const bookingMatch = subject.match(/(?:new\s+)?booking[:\s]+(.+?)\s*[x×]\s*fl[aâ]neur/i);
  if (bookingMatch) return bookingMatch[1].trim();

  // "Collaboration: Brand & Flaneur" or similar
  const collabMatch = subject.match(/collaboration[:\s]+(.+?)\s*[&×x]\s*fl[aâ]neur/i);
  if (collabMatch) return collabMatch[1].trim();

  // "Brand has booked..." pattern
  const bookedMatch = subject.match(/^(.+?)\s+has\s+booked/i);
  if (bookedMatch) return bookedMatch[1].trim();

  return null;
}

/** Extract dollar amount from text */
function extractAmount(text: string): number {
  // Look for labeled amounts first: "Amount: $500", "Total: $1,200.00", "Price: $200"
  const labeledMatch = text.match(/(?:amount|total|price|cost|payment|fee)[:\s]*\$?([\d,]+\.?\d*)/i);
  if (labeledMatch) {
    return parseFloat(labeledMatch[1].replace(/,/g, ''));
  }

  // Look for standalone dollar amounts (largest one is likely the booking price)
  const dollarMatches = text.match(/\$([\d,]+\.?\d*)/g);
  if (dollarMatches && dollarMatches.length > 0) {
    const amounts = dollarMatches
      .map(m => parseFloat(m.replace(/[$,]/g, '')))
      .filter(n => !isNaN(n) && n > 0);
    if (amounts.length > 0) {
      // Return the largest amount (likely the booking total)
      return Math.max(...amounts);
    }
  }

  // Euro amounts
  const euroMatch = text.match(/(?:amount|total|price)[:\s]*€?([\d.,]+)/i);
  if (euroMatch) {
    return parseFloat(euroMatch[1].replace(/,/g, ''));
  }

  return 0;
}

/** Extract email addresses from text */
function extractEmails(text: string): string[] {
  const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const matches = text.match(emailPattern) || [];
  // Filter out known internal addresses
  return matches.filter(
    (e) =>
      !e.includes('readflaneur.com') &&
      !e.includes('passionfroot.me') &&
      !e.includes('passionfroot.com') &&
      !e.includes('noreply') &&
      !e.includes('no-reply') &&
      !e.includes('notifications@')
  );
}

/** Extract a labeled value from text (e.g., "Client: Acme Corp") */
function extractLabeled(text: string, labels: string[]): string | null {
  for (const label of labels) {
    const pattern = new RegExp(`${label}[:\\s]+([^\\n]+)`, 'i');
    const match = text.match(pattern);
    if (match) {
      const value = match[1].trim();
      if (value.length > 0 && value.length < 200) return value;
    }
  }
  return null;
}

/** Check for design concierge keywords */
function detectDesignService(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes('design') ||
    lower.includes('concierge') ||
    lower.includes('creative service') ||
    lower.includes('creative production')
  );
}

/**
 * Parse a Passionfroot booking notification email.
 * Returns extracted booking data, or null if the email
 * doesn't appear to be a Passionfroot booking.
 */
export function parsePassionfrootEmail(
  subject: string,
  html: string | null,
  text: string | null
): ParsedBooking | null {
  const subjectLower = subject.toLowerCase();

  // Quick check: is this a booking email?
  const isBooking =
    subjectLower.includes('booking') ||
    subjectLower.includes('collaboration') ||
    subjectLower.includes('passionfroot') ||
    subjectLower.includes('new order');

  if (!isBooking) return null;

  // Get plain text from HTML or use text body
  const plainFromHtml = html ? stripHtml(html) : '';
  const plainText = text || '';
  const allText = `${subject}\n${plainFromHtml}\n${plainText}`;

  // Extract client name
  const clientName =
    extractClientFromSubject(subject) ||
    extractLabeled(allText, ['client', 'brand', 'company', 'partner', 'advertiser', 'buyer']) ||
    'Unknown Client';

  // Extract client email
  const emails = extractEmails(allText);
  const clientEmail = emails[0] || '';

  // Extract product name
  const productName =
    extractLabeled(allText, ['product', 'package', 'plan', 'tier', 'item']) || '';

  // Extract amount
  const amount = extractAmount(allText);

  // Detect design service
  const needsDesign = detectDesignService(allText);

  return {
    clientName,
    clientEmail,
    productName,
    amount,
    needsDesign,
  };
}
