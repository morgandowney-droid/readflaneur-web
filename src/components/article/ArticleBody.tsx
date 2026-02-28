'use client';

import { ReactNode, useState, useMemo } from 'react';
import { isEventLine, isPlaceholder } from '@/lib/look-ahead-events';

interface ArticleBodyProps {
  content: string;
  neighborhoodName: string;
  city: string;
  articleType?: string;
  country?: string;
}

/** Detect greeting lines across 9 languages - matches the patterns in NeighborhoodBrief.tsx */
function isGreetingLine(text: string): boolean {
  const trimmed = text.trim();
  const patterns = [
    /^(good\s+morning|morning|hello|hey|greetings)/i,
    /^(god\s+morgon|hej|morrn)/i,
    /^(bonjour|bon\s+matin|salut)/i,
    /^(guten\s+morgen|morgen|hallo)/i,
    /^(buenos\s+d[ií]as|hola|buen\s+d[ií]a)/i,
    /^(bom\s+dia|ol[aá])/i,
    /^(buongiorno|buon\s+giorno|ciao)/i,
    /^(早上好|早安|你好)/,
    /^(おはようございます|おはよう|こんにちは)/,
  ];
  return patterns.some(p => p.test(trimmed));
}

export function ArticleBody({ content, neighborhoodName, city, articleType, country }: ArticleBodyProps) {
  // Strip all links (HTML and markdown) from content, keeping just the text
  let cleanedContent = content
    // Strip teaser labels that Gemini outputs as prose (for email/subject only, not display)
    .replace(/^(?:SUBJECT|subject)[_ ](?:TEASER|teaser):.*$/gm, '')
    .replace(/^(?:EMAIL|email)[_ ](?:TEASER|teaser):.*$/gm, '')
    // Strip raw Grok search result objects that leak into content
    .replace(/\{['"](?:title|url|snippet|author|published_at)['"]:[^}]*(?:\}|$)/gm, '')
    // Convert HTML <a> tags to markdown links (preserves hyperlinks for rendering)
    .replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/gi, '[$2]($1)')
    // Strip any other HTML tags that may have been generated
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|span|strong|em|b|i)[^>]*>/gi, '')
    // Clean content: remove citation markers and bare URLs (but preserve URLs inside markdown links)
    .replace(/\[\[\d+\]\]/g, '')
    .replace(/(?<!\]\()https?:\/\/\S+/g, '')
    // Replace em dashes with period and space
    .replace(/\s*—\s*/g, '. ')
    // Fix double periods
    .replace(/\.\.\s*/g, '. ')
    .trim();

  // For Daily Brief articles, ensure the greeting is the first visible paragraph.
  // Gemini sometimes outputs subject_teaser and email_teaser as prose text before the
  // greeting, causing inconsistent opening content across different briefs.
  if (articleType === 'brief_summary') {
    const lines = cleanedContent.split(/\n\n+/);
    const greetingIdx = lines.findIndex(l => isGreetingLine(l.trim()));
    if (greetingIdx > 0) {
      // Drop everything before the greeting (teaser labels, summary lines)
      cleanedContent = lines.slice(greetingIdx).join('\n\n');
    }
  }

  // Split event listing from prose body at --- separator
  let eventListingBlock: string | null = null;
  let proseContent = cleanedContent;

  const separatorMatch = cleanedContent.match(/^\[\[Event Listing\]\]\s*([\s\S]*?)\n---\s*\n/);
  if (separatorMatch) {
    eventListingBlock = separatorMatch[1].trim();
    proseContent = cleanedContent.substring(separatorMatch[0].length).trim();
  }

  // Insert paragraph breaks before section headers [[...]]
  // This ensures headers get their own line/block
  proseContent = proseContent.replace(/\s*(\[\[[^\]]+\]\])\s*/g, '\n\n$1\n\n');

  // Also insert paragraph breaks after sentences that end with ]] (header followed by content)
  proseContent = proseContent.replace(/\]\]\s+([A-Z])/g, ']]\n\n$1');

  // Split into paragraphs - handle both \n\n and single \n
  const rawParagraphs = proseContent
    .split(/\n\n+/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  // Split long paragraphs on sentence boundaries (~2-3 sentences each).
  // Look Ahead articles often have one giant paragraph per day section with
  // multiple events crammed together. This breaks them into readable chunks.
  const paragraphs: string[] = [];
  for (const para of rawParagraphs) {
    // Skip headers and short paragraphs
    if (para.match(/^\[\[/) || para.length <= 400) {
      paragraphs.push(para);
      continue;
    }
    const sentences = para.split(/(?<=[.!?])\s+(?=[A-Z])/);
    let currentPara = '';
    for (const sentence of sentences) {
      if (currentPara.length + sentence.length > 300 && currentPara.length > 0) {
        paragraphs.push(currentPara.trim());
        currentPara = sentence;
      } else {
        currentPara += (currentPara ? ' ' : '') + sentence;
      }
    }
    if (currentPara.trim()) {
      paragraphs.push(currentPara.trim());
    }
  }

  // When Look Ahead has a structured event listing, the prose restates the same
  // events in paragraph form - skip it entirely.
  const skipProse = articleType === 'look_ahead' && eventListingBlock;

  const pClass = 'text-fg text-[1.1rem] md:text-[1.2rem] leading-relaxed mb-6';

  // Render function that handles strong tags and markdown links
  const renderParts = (text: string): ReactNode[] => {
    const result: ReactNode[] = [];
    // Split on both <strong> tags and markdown links [text](url)
    const parts = text.split(/(<strong>[^<]+<\/strong>|\[[^\]]+\]\(https?:\/\/[^)]+\))/);

    parts.forEach((part, partIdx) => {
      const strongMatch = part.match(/<strong>([^<]+)<\/strong>/);
      const linkMatch = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/);
      if (strongMatch) {
        result.push(<strong key={`strong-${partIdx}`} className="font-bold text-fg">{strongMatch[1]}</strong>);
      } else if (linkMatch) {
        result.push(
          <a key={`link-${partIdx}`} href={linkMatch[2]} target="_blank" rel="noopener noreferrer" className="text-current font-semibold underline decoration-dotted decoration-neutral-500/40 decoration-1 underline-offset-4 hover:decoration-solid hover:decoration-neutral-300/60">
            {linkMatch[1]}
          </a>
        );
      } else if (part) {
        result.push(part);
      }
    });

    return result;
  };

  return (
    <article className="max-w-none" style={{ fontFamily: 'var(--font-body-serif)' }}>
      {/* Structured event listing block */}
      {eventListingBlock && (
        <EventListingBlock content={eventListingBlock} city={city} country={country} />
      )}

      {/* Prose body (skipped for Look Ahead when event listing exists) */}
      {!skipProse && paragraphs.map((paragraph, index) => {
        // Check if this is a section header (wrapped in [[ ]])
        const headerMatch = paragraph.match(/^\[\[([^\]]+)\]\]$/);
        if (headerMatch) {
          return (
            <h3 key={index} className="text-lg font-semibold text-fg mt-8 mb-4" style={{ fontFamily: 'var(--font-body-serif)' }}>
              {headerMatch[1]}
            </h3>
          );
        }

        // Process bold markers
        const processedParagraph = paragraph.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

        // Render content with line breaks preserved
        const lines = processedParagraph.split(/  \n|\n/);
        const rendered: ReactNode[] = [];
        lines.forEach((line, lineIdx) => {
          if (lineIdx > 0) rendered.push(<br key={`br-${lineIdx}`} />);
          rendered.push(...renderParts(line));
        });

        return (
          <p key={index} className={pClass}>
            {rendered}
          </p>
        );
      })}
    </article>
  );
}

/** Parsed event with structured fields for filtering and display */
interface ParsedEvent {
  name: string;
  category: string | null;
  time: string | null;
  venue: string | null;
  address: string | null;
  price: string | null;
  dayLabel: string;
  alsoOn: string | null; // "(also on Sun, Mon)" suffix
}

/** Time-of-day bucket for filtering */
type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'all-day';

/**
 * Convert 24h time to AM/PM for US locales.
 * "19:00" -> "7:00 PM", "10:00-15:00" -> "10:00 AM - 3:00 PM"
 * Already AM/PM -> pass through. Null/missing -> null.
 */
function formatTime(timeStr: string | null, country?: string): string | null {
  if (!timeStr || isPlaceholder(timeStr)) return null;
  const isUS = country?.toUpperCase() === 'US' || country?.toUpperCase() === 'USA' || country?.toUpperCase() === 'UNITED STATES';
  if (!isUS) return timeStr;
  // Already has AM/PM - pass through
  if (/[AaPp][Mm]/.test(timeStr)) return timeStr;
  // Convert each HH:MM occurrence
  return timeStr.replace(/(\d{1,2}):(\d{2})/g, (_, h, m) => {
    const hour = parseInt(h, 10);
    if (isNaN(hour)) return `${h}:${m}`;
    const suffix = hour >= 12 ? 'PM' : 'AM';
    const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${h12}:${m} ${suffix}`;
  });
}

/**
 * Classify an event's time into a time-of-day bucket.
 */
function classifyTimeOfDay(time: string | null): TimeOfDay {
  if (!time) return 'all-day';
  const match = time.match(/(\d{1,2}):(\d{2})/);
  if (!match) {
    // Check for AM/PM style
    const ampmMatch = time.match(/(\d{1,2}):?\d{0,2}\s*(AM|PM)/i);
    if (!ampmMatch) return 'all-day';
    let hour = parseInt(ampmMatch[1], 10);
    if (ampmMatch[2].toUpperCase() === 'PM' && hour !== 12) hour += 12;
    if (ampmMatch[2].toUpperCase() === 'AM' && hour === 12) hour = 0;
    if (hour < 12) return 'morning';
    if (hour < 17) return 'afternoon';
    return 'evening';
  }
  const hour = parseInt(match[1], 10);
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

/**
 * Strip Grok's "(not Vasastan)", "(bordering Ostermalm)", etc. from addresses.
 */
function stripNeighborhoodAnnotations(text: string): string {
  return text.replace(/\s*\((not|bordering|near|outside|close to)\s+[^)]+\)\s*/gi, '').trim();
}

/**
 * Normalize category labels: "Music/Show" -> "Music", "Food & Drink/Fair" -> "Food & Drink".
 * Strips slash-suffixes that are sub-types and clutter the badge display.
 */
function normalizeCategory(cat: string): string {
  // Strip "/SubType" suffix (e.g., "Music/Show" -> "Music", "Theater/Musical" -> "Theater")
  return cat.replace(/\/\w+$/, '').trim();
}

/**
 * Parse the raw event listing content into structured data.
 */
function parseEventListing(content: string, country?: string): { days: string[]; events: ParsedEvent[] } {
  const lines = content.split(/\n\n+/).map(l => l.trim()).filter(Boolean);
  const events: ParsedEvent[] = [];
  const days: string[] = [];
  let currentDay = '';

  for (const line of lines) {
    const headerMatch = line.match(/^\[\[(.+)\]\]$/);
    if (headerMatch) {
      currentDay = headerMatch[1];
      if (!days.includes(currentDay)) days.push(currentDay);
      continue;
    }

    if (!isEventLine(line)) continue;

    // Strip trailing period and "(also on ...)" suffix
    let cleanLine = line.replace(/\.$/, '');
    let alsoOn: string | null = null;
    const alsoMatch = cleanLine.match(/\s*\(also on ([^)]+)\)\s*$/);
    if (alsoMatch) {
      alsoOn = alsoMatch[1];
      cleanLine = cleanLine.substring(0, alsoMatch.index);
    }

    const segments = cleanLine.split(';').map(s => s.trim());
    const name = segments[0] || '';
    if (isPlaceholder(name)) continue;

    // Segment 1: category + time (e.g., "Art Exhibition, 17:00-20:00")
    let category: string | null = null;
    let time: string | null = null;
    if (segments[1]) {
      const catTimeParts = segments[1].split(',').map(s => s.trim());
      for (const part of catTimeParts) {
        if (/\d{1,2}[:.]\d{2}/.test(part) || /\d{1,2}\s*(AM|PM)/i.test(part)) {
          time = part;
        } else if (!isPlaceholder(part)) {
          category = normalizeCategory(part);
        }
      }
    }

    // Segment 2: venue, address - strip neighborhood annotations
    let venue: string | null = null;
    let address: string | null = null;
    if (segments[2]) {
      const cleanedSeg = stripNeighborhoodAnnotations(segments[2]);
      const locParts = cleanedSeg.split(',').map(s => s.trim()).filter(Boolean);
      venue = isPlaceholder(locParts[0]) ? null : locParts[0] || null;
      if (locParts.length > 1) {
        const addr = locParts.slice(1).join(', ');
        address = isPlaceholder(addr) ? null : addr;
      }
    }

    // Segment 3: price
    let price: string | null = null;
    if (segments[3] && !isPlaceholder(segments[3])) {
      price = segments[3];
    }

    // Filter placeholder time
    if (isPlaceholder(time)) time = null;

    events.push({
      name,
      category,
      time: formatTime(time, country),
      venue,
      address,
      price,
      dayLabel: currentDay,
      alsoOn,
    });
  }

  return { days, events };
}

/**
 * Interactive event listing with day/time/category filters and hyperlinked names.
 */
function EventListingBlock({ content, city, country }: { content: string; city: string; country?: string }) {
  const { days, events } = useMemo(() => parseEventListing(content, country), [content, country]);

  // Filter state
  const [activeDay, setActiveDay] = useState<string | null>(null);
  const [activeTimeOfDay, setActiveTimeOfDay] = useState<Set<TimeOfDay>>(new Set());
  const [activeCategories, setActiveCategories] = useState<Set<string>>(new Set());
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Extract unique categories
  const allCategories = useMemo(() => {
    const cats = new Set<string>();
    events.forEach(e => { if (e.category) cats.add(e.category); });
    return Array.from(cats).sort();
  }, [events]);

  const visibleCategoryCount = 5;
  const displayedCategories = showAllCategories ? allCategories : allCategories.slice(0, visibleCategoryCount);
  const hiddenCategoryCount = allCategories.length - visibleCategoryCount;

  // Apply filters
  const filteredEvents = useMemo(() => {
    return events.filter(e => {
      if (activeDay && e.dayLabel !== activeDay) return false;
      if (activeTimeOfDay.size > 0) {
        const tod = classifyTimeOfDay(e.time);
        if (!activeTimeOfDay.has(tod)) return false;
      }
      if (activeCategories.size > 0 && (!e.category || !activeCategories.has(e.category))) return false;
      return true;
    });
  }, [events, activeDay, activeTimeOfDay, activeCategories]);

  // Group filtered events by day (preserving original day order)
  const groupedFiltered = useMemo(() => {
    const map = new Map<string, ParsedEvent[]>();
    for (const e of filteredEvents) {
      const existing = map.get(e.dayLabel) || [];
      existing.push(e);
      map.set(e.dayLabel, existing);
    }
    return map;
  }, [filteredEvents]);

  const activeFilterCount = (activeDay ? 1 : 0) + activeTimeOfDay.size + activeCategories.size;
  const hasFilters = activeFilterCount > 0;

  const clearFilters = () => {
    setActiveDay(null);
    setActiveTimeOfDay(new Set());
    setActiveCategories(new Set());
  };

  const toggleTimeOfDay = (tod: TimeOfDay) => {
    setActiveTimeOfDay(prev => {
      const next = new Set(prev);
      if (next.has(tod)) next.delete(tod); else next.add(tod);
      return next;
    });
  };

  const toggleCategory = (cat: string) => {
    setActiveCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  };

  const pillBase = 'inline-flex items-center px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer select-none';
  const pillActive = 'bg-accent/20 text-accent border border-accent/30';
  const pillInactive = 'bg-surface text-fg-muted border border-border hover:border-border-strong hover:text-fg';

  return (
    <div className="mb-10" style={{ fontFamily: 'var(--font-body-serif)' }}>
      {/* Filter toggle + collapsible filter bar */}
      <div className="mb-6">
        <button
          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer select-none ${hasFilters ? pillActive : pillInactive}`}
          onClick={() => setFiltersOpen(!filtersOpen)}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/></svg>
          Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${filtersOpen ? 'rotate-180' : ''}`}><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        {hasFilters && !filtersOpen && (
          <button onClick={clearFilters} className="text-fg-muted text-xs ml-3 hover:text-fg transition-colors">Clear</button>
        )}

        {filtersOpen && (
          <div className="mt-3 space-y-3">
            {/* Day pills */}
            {days.length > 1 && (
              <div className="flex flex-wrap gap-2">
                <button
                  className={`${pillBase} ${activeDay === null ? pillActive : pillInactive}`}
                  onClick={() => setActiveDay(null)}
                >All days</button>
                {days.map(day => (
                  <button
                    key={day}
                    className={`${pillBase} ${activeDay === day ? pillActive : pillInactive}`}
                    onClick={() => setActiveDay(activeDay === day ? null : day)}
                  >{day.replace(/,.*$/, '')}</button>
                ))}
              </div>
            )}

            {/* Time-of-day chips */}
            <div className="flex flex-wrap gap-2">
              {(['morning', 'afternoon', 'evening', 'all-day'] as TimeOfDay[]).map(tod => (
                <button
                  key={tod}
                  className={`${pillBase} ${activeTimeOfDay.has(tod) ? pillActive : pillInactive}`}
                  onClick={() => toggleTimeOfDay(tod)}
                >{tod === 'all-day' ? 'All Day' : tod.charAt(0).toUpperCase() + tod.slice(1)}</button>
              ))}
            </div>

            {/* Category chips */}
            {allCategories.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {displayedCategories.map(cat => (
                  <button
                    key={cat}
                    className={`${pillBase} ${activeCategories.has(cat) ? pillActive : pillInactive}`}
                    onClick={() => toggleCategory(cat)}
                  >{cat}</button>
                ))}
                {!showAllCategories && hiddenCategoryCount > 0 && (
                  <button
                    className={`${pillBase} ${pillInactive}`}
                    onClick={() => setShowAllCategories(true)}
                  >+{hiddenCategoryCount} more</button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Events */}
      {filteredEvents.length === 0 ? (
        <div className="text-center py-8 text-fg-muted">
          <p className="text-sm">No events match your filters.</p>
          <button onClick={clearFilters} className="text-accent text-sm mt-2 hover:underline">Clear filters</button>
        </div>
      ) : (
        <div className="space-y-2">
          {days.filter(d => groupedFiltered.has(d)).map(day => (
            <div key={day}>
              <p className={`text-sm font-semibold text-fg uppercase tracking-widest mb-2 mt-5`}>
                {day}
              </p>
              {groupedFiltered.get(day)!.map((event, i) => {
                const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(event.name + ' ' + city)}`;
                const metaParts: string[] = [];
                if (event.time) metaParts.push(event.time);
                if (event.venue) metaParts.push(event.venue);
                if (event.address) metaParts.push(event.address);
                if (event.price) metaParts.push(event.price);
                if (event.alsoOn) metaParts.push(`also on ${event.alsoOn}`);

                return (
                  <div key={`${day}-${i}`} className="py-2 flex">
                    <span className="text-fg-subtle/40 mr-3 mt-[0.35rem] select-none text-sm shrink-0">&bull;</span>
                    <div className="min-w-0">
                      {/* Line 1: hyperlinked name + category badge */}
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <a
                          href={searchUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-fg font-semibold text-[0.95rem] underline decoration-dotted decoration-neutral-500/40 decoration-1 underline-offset-4 hover:decoration-solid hover:decoration-neutral-300/60"
                        >
                          {event.name}
                        </a>
                        {event.category && (
                          <span className="text-[10px] uppercase tracking-wider text-fg-subtle bg-surface border border-border rounded-full px-2 py-0.5 whitespace-nowrap">
                            {event.category}
                          </span>
                        )}
                      </div>
                      {/* Line 2: time, venue, address, price */}
                      {metaParts.length > 0 && (
                        <p className="text-[0.85rem] text-fg-muted leading-relaxed mt-0.5">
                          {metaParts.map((part, pi) => (
                            <span key={pi}>
                              {pi > 0 && <span className="text-fg-subtle mx-1">&middot;</span>}
                              {part}
                            </span>
                          ))}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* Active filter summary */}
      {hasFilters && filteredEvents.length > 0 && (
        <div className="mt-4 pt-3 border-t border-border">
          <button onClick={clearFilters} className="text-fg-muted text-xs hover:text-fg transition-colors">
            Showing {filteredEvents.length} of {events.length} events - Clear filters
          </button>
        </div>
      )}
    </div>
  );
}
