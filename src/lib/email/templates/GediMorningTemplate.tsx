import { Html, Head, Body, Container, Section, Text, Link, Hr } from '@react-email/components';
import type { MorningContent, MorningEdition } from '../gedi-morning';

/**
 * The GEDI morning email, in Italian. Same light house style as the Daily
 * Brief (DailyBriefTemplate): Playfair masthead, tracked caps section labels,
 * system sans body, grey rules.
 */
export function GediMorningTemplate({ content, preview }: { content: MorningContent; preview: boolean }) {
  const withAny = content.editions.filter((e) => e.brief || e.lookAhead).length;
  const previewText = `${withAny} edizioni su ${content.editions.length} pubblicate stamattina. Le decisioni sul feed si prendono sulla scrivania editoriale.`;
  return (
    <Html lang="it">
      <Head>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&display=swap');`}</style>
      </Head>
      <div style={previewHidden}>{previewText}</div>
      <Body style={main}>
        <Container style={container}>
          {preview && (
            <Text style={previewBanner}>ANTEPRIMA - inviata solo a md@readflaneur.com</Text>
          )}
          <Text style={masthead}><Link href="https://readflaneur.com" style={mastheadLink}>FLANEUR</Link></Text>
          <Text style={dateLine}>{content.dateLabel}</Text>
          <Hr style={divider} />

          <Text style={intro}>
            Buongiorno. Ecco le quattro edizioni di stamattina: per ogni quartiere il Daily Brief e il Look Ahead, con i link alle pagine in italiano.
          </Text>
          {content.deskUrl && (
            <Section style={deskBox}>
              <Text style={deskText}>
                La scrivania editoriale è qui:{' '}
                <Link href={content.deskUrl} style={deskLink}>apri la scrivania GEDI</Link>.
                {' '}Quello che approvate lì è ciò che il vostro feed pubblica; ciò che sospendete o non approvate resta fuori.
              </Text>
            </Section>
          )}

          {content.editions.map((ed) => (
            <EditionBlock key={ed.id} ed={ed} />
          ))}

          <Hr style={divider} />
          <Text style={footer}>
            Le pagine collegate sono la vetrina pubblica di Flaneur e mostrano tutto ciò che il sistema ha pubblicato; il feed di GEDI porta solo ciò che approvate sulla scrivania.
          </Text>
          <Text style={footer}>
            Per rispondere basta rispondere a questa email.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

function EditionBlock({ ed }: { ed: MorningEdition }) {
  const nothing = !ed.brief && !ed.lookAhead;
  return (
    <Section style={editionSection}>
      <Text style={editionLabel}>
        {ed.name}
        <span style={editionCity}> &middot; {ed.city}</span>
      </Text>
      <Hr style={goldRule} />

      {nothing && (
        <Text style={emptyLine}>
          {ed.error
            ? `Stamattina non siamo riusciti a leggere l'edizione di ${ed.name}; la controlliamo noi.`
            : `Stamattina nessuna edizione pubblicata per ${ed.name}.`}
        </Text>
      )}

      {ed.brief ? (
        <Section>
          <Text style={kicker}>Daily Brief</Text>
          <Text style={headline}>
            <Link href={ed.brief.url} style={headlineLink}>{ed.brief.headline}</Link>
          </Text>
          {ed.brief.stories.map((s, i) => (
            <Section key={i} style={storyRow}>
              <Text style={storyHeader}>{s.header}</Text>
              <Text style={storyText}>{s.text}</Text>
            </Section>
          ))}
          <Text style={readMore}>
            <Link href={ed.brief.url} style={readMoreLink}>
              {ed.brief.moreCount > 0 ? `Leggi il Daily Brief completo (altre ${ed.brief.moreCount} notizie)` : 'Leggi il Daily Brief completo'}
            </Link>
          </Text>
        </Section>
      ) : !nothing ? (
        <Text style={emptyLine}>Nessun Daily Brief pubblicato stamattina per {ed.name}.</Text>
      ) : null}

      {ed.lookAhead ? (
        <Section style={laSection}>
          <Text style={kicker}>Look Ahead</Text>
          <Text style={headlineSmall}>
            <Link href={ed.lookAhead.url} style={headlineLink}>{ed.lookAhead.headline}</Link>
          </Text>
          {ed.lookAhead.events.map((e, i) => (
            <Text key={i} style={eventLine}>
              <span style={eventWhen}>{e.when}</span>
              {'  '}
              {e.name}
              {e.place ? <span style={eventPlace}> &middot; {e.place}</span> : null}
            </Text>
          ))}
          {ed.lookAhead.intro && <Text style={storyText}>{ed.lookAhead.intro}</Text>}
          <Text style={readMore}>
            <Link href={ed.lookAhead.url} style={readMoreLink}>
              {ed.lookAhead.moreCount > 0 ? `Tutti gli appuntamenti (altri ${ed.lookAhead.moreCount})` : 'Apri il Look Ahead'}
            </Link>
          </Text>
        </Section>
      ) : !nothing ? (
        <Text style={emptyLine}>Nessun Look Ahead pubblicato stamattina per {ed.name}.</Text>
      ) : null}

      {ed.english && !nothing && (
        <Text style={note}>La traduzione italiana non era pronta: una parte di questa edizione è in inglese.</Text>
      )}
    </Section>
  );
}

const sans = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const serif = "'Playfair Display', Georgia, 'Times New Roman', serif";

const main = { backgroundColor: '#ffffff', fontFamily: sans };
const container = { maxWidth: '600px', margin: '0 auto', padding: '0 16px' };
const previewBanner = {
  fontSize: '11px', letterSpacing: '0.15em', textAlign: 'center' as const, color: '#92400e',
  backgroundColor: '#fef3c7', padding: '6px 0', margin: '16px 0 0', fontFamily: sans,
};
const masthead = {
  fontSize: '28px', fontWeight: '400' as const, letterSpacing: '0.25em', textAlign: 'center' as const,
  padding: '32px 0 8px', margin: '0', color: '#000000', fontFamily: serif,
};
const mastheadLink = { color: '#000000', textDecoration: 'none' as const };
const dateLine = { fontSize: '12px', color: '#b0b0b0', textAlign: 'center' as const, margin: '0 0 16px', fontFamily: sans };
const divider = { borderTop: '1px solid #e5e5e5', margin: '0 0 8px' };
const intro = { fontSize: '15px', lineHeight: '1.6', color: '#333333', margin: '16px 0 12px', fontFamily: sans };
const deskBox = { border: '1px solid #e5e5e5', borderRadius: '8px', backgroundColor: '#fafafa', padding: '10px 16px', margin: '0 0 8px' };
const deskText = { fontSize: '13px', lineHeight: '1.55', color: '#555555', margin: '0', fontFamily: sans };
const deskLink = { color: '#171717', fontWeight: 600 as const, textDecoration: 'underline' };
const editionSection = { padding: '24px 0 4px' };
const editionLabel = {
  fontSize: '12px', letterSpacing: '0.2em', textTransform: 'uppercase' as const, color: '#1a1a1a',
  textAlign: 'center' as const, margin: '0 0 6px', fontFamily: sans,
};
const editionCity = { color: '#b0b0b0', letterSpacing: '0.15em' };
const goldRule = { borderTop: '1px solid rgba(120, 53, 15, 0.4)', width: '32px', margin: '0 auto 16px' };
const kicker = {
  fontSize: '10px', letterSpacing: '0.18em', textTransform: 'uppercase' as const, color: '#999999',
  margin: '0 0 4px', fontFamily: sans,
};
const headline = { fontSize: '21px', lineHeight: '1.3', fontWeight: '600' as const, margin: '0 0 12px', fontFamily: serif };
const headlineSmall = { fontSize: '18px', lineHeight: '1.3', fontWeight: '600' as const, margin: '0 0 10px', fontFamily: serif };
const headlineLink = { color: '#1a1a1a', textDecoration: 'none' as const };
const storyRow = { margin: '0 0 10px' };
const storyHeader = { fontSize: '14px', fontWeight: '600' as const, color: '#1a1a1a', margin: '0 0 2px', fontFamily: sans };
const storyText = { fontSize: '14px', lineHeight: '1.55', color: '#444444', margin: '0', fontFamily: sans };
const laSection = { padding: '14px 0 0', borderTop: '1px solid #eeeeee', marginTop: '10px' };
const eventLine = { fontSize: '14px', lineHeight: '1.5', color: '#333333', margin: '0 0 4px', fontFamily: sans };
const eventWhen = { color: '#999999', fontSize: '12px', letterSpacing: '0.03em' };
const eventPlace = { color: '#888888' };
const readMore = { fontSize: '13px', margin: '8px 0 0', fontFamily: sans };
const readMoreLink = { color: '#171717', fontWeight: 600 as const, textDecoration: 'underline' };
const emptyLine = { fontSize: '14px', color: '#999999', fontStyle: 'italic' as const, margin: '0 0 8px', fontFamily: sans };
const note = { fontSize: '12px', color: '#999999', margin: '8px 0 0', fontFamily: sans };
const footer = { fontSize: '12px', lineHeight: '1.5', color: '#999999', textAlign: 'center' as const, margin: '12px 0', fontFamily: sans };
const previewHidden = {
  display: 'none', fontSize: '1px', lineHeight: '1px', maxHeight: '0', maxWidth: '0', opacity: 0, overflow: 'hidden',
};
