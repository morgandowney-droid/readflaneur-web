# Flaneur Broker Research — Gemini Prompt (Global)

Paste everything below into Gemini (Gemini 2.5 Pro with Deep Research strongly recommended). Output goal: a single CSV of verified broker contact info covering every neighborhood Flaneur operates in.

You will also want to upload or reference the companion file [`flaneur-neighborhoods.csv`](./flaneur-neighborhoods.csv) — it contains the exact 251 active neighborhood IDs, display names, and countries that I need brokers for. **Use the IDs from that file verbatim. Don't invent new IDs.**

---

## Your task

I'm the founder of **Flaneur** (readflaneur.com), an editorial morning newsletter for luxury real estate. We're launching a B2B product where one top-producing broker per neighborhood gets an exclusive branded edition — their name, photo, and listings at the top of a daily neighborhood brief delivered to their client list at 7 AM local time. Pricing is US$999/month with a 14-day free trial.

I need you to produce a CSV of **4–5 top-producing brokers per neighborhood, one per competing firm** — people I will cold-pitch over the next 24 hours. There are 251 neighborhoods across 37 countries, so this is a big project — do it in regional passes, region-by-region, and return one CSV at the end (or multiple CSVs, one per region, that I can concatenate).

---

## Non-negotiable rules

1. **NEVER guess emails.** Only record an email if you physically see it printed on a source page (brokerage bio, personal agent site, LinkedIn public contact, a press article quoting the email, etc.). Wrong guesses damage my sender reputation.
2. **Cite the source URL** for every email you find, in the `notes` column.
3. If you cannot find a printed direct email after checking brokerage bio + personal site + LinkedIn + press: leave the email column **blank** and note what you tried in `notes`.
4. **Pick the single TOP PRODUCER at each firm for each neighborhood.** Not multiple agents at the same firm, not junior agents, not teams as a whole. Look for: luxury specialist tags, transaction-volume rankings, Partner / Senior Vice President titles, agents whose listings in the neighborhood are recent and high-priced.
5. **Verify each person is currently at that firm.** Brokers move firms frequently; check the brokerage's current agent page (not an archived one). If the brokerage URL gives a 404, they've moved — find the new firm or skip.
6. **Active listing requirement:** Record one active listing (address + price) as proof they're actively producing. If they haven't closed in 12 months, skip them and pick another broker at the same firm.
7. **Use the `neighborhood_id` exactly as given in `flaneur-neighborhoods.csv`.** If an ID doesn't exist there, don't invent one.

---

## Output format (exact)

Write the result as a CSV with this header row, then one row per broker:

```csv
neighborhood_id,neighborhood_display,agent_name,agent_email,agent_title,agent_phone,brokerage_name,brokerage_url,photo_url,sample_listing_url,sample_listing_address,sample_listing_price,priority,status,sent_at,notes
```

Column meanings:

| Column | Notes |
|---|---|
| `neighborhood_id` | From `flaneur-neighborhoods.csv`, verbatim |
| `neighborhood_display` | From `flaneur-neighborhoods.csv`, verbatim |
| `agent_name` | Full name exactly as on their brokerage bio |
| `agent_email` | Direct email from a verified source, or blank if not printed |
| `agent_title` | As printed on their bio |
| `agent_phone` | Direct line if shown, else office line, else blank |
| `brokerage_name` | Firm name as publicly used |
| `brokerage_url` | The agent's bio page on the brokerage site |
| `photo_url` | Direct URL to their headshot (for my records, never embedded in emails) |
| `sample_listing_url` | One active listing they represent |
| `sample_listing_address` | Street address only (no city/state) |
| `sample_listing_price` | Include currency symbol: `US$8,500,000`, `£12,000,000`, `€4,500,000`, `A$8,000,000`, `HK$150,000,000`, `S$20,000,000`, `85,000,000 SEK`, `¥2,500,000,000` |
| `priority` | `1` for top producer (award-winner, partner-level, multi-billion career volume), `2` solid producer, `3` uncertain |
| `status` | Always exactly `queued` |
| `sent_at` | Leave blank |
| `notes` | Source URLs + any caveats |

### CSV formatting rules

- Use **double quotes** around any field containing a comma, quote, or newline (e.g. `"Aspen, Colorado"`, `"US$14,950,000"`).
- Escape embedded quotes by doubling: `"She said ""hi"""`.
- **Strip Cloudflare image transformation URLs** — a URL containing `?format=auto,quality=85` has embedded commas that break CSV parsing. Either strip the transformation params (just keep the media path) or wrap the whole URL in double quotes.
- Unix line endings (`\n`).
- UTF-8 encoding. Swedish `å ä ö`, French `é è à`, Japanese characters, etc. are all fine.

### Example row (real, verified format)

```csv
nyc-tribeca,"Tribeca, NYC",Leonard Steinberg,ls@compass.com,"Chief Evangelist / Corporate Broker",917-385-0565,Compass,https://www.compass.com/agents/leonard-steinberg/,https://www.compass.com/m/13/agent-headshot.webp,https://www.compass.com/homedetails/25-Grace-Ct-Brooklyn-NY-11201/listing_pid/,"25 Grace Court, Brooklyn Heights","US$15,000,000",1,queued,,"Longtime Tribeca/downtown luxury leader. Email printed on compass.com agent page."
```

---

## Neighborhoods to research

**See `flaneur-neighborhoods.csv`** (attached/linked). It contains all 251 active neighborhoods with columns `neighborhood_id`, `neighborhood_display`, `country`.

Coverage by country (largest first):

| Country | # neighborhoods |
|---|---|
| USA | 67 |
| France | 14 |
| UK | 14 |
| Spain | 13 |
| Australia | 12 |
| Germany | 11 |
| Italy | 10 |
| Canada | 8 |
| Japan | 7 |
| Switzerland | 7 |
| Singapore | 6 |
| South Africa | 6 |
| UAE | 6 |
| Brazil | 5 |
| Denmark | 5 |
| Hong Kong | 5 |
| New Zealand | 5 |
| Portugal | 5 |
| China | 4 |
| Ireland | 4 |
| Mexico | 4 |
| Netherlands | 4 |
| Argentina | 3 |
| Greece | 3 |
| Indonesia | 3 |
| South Korea | 3 |
| Sweden | 3 |
| Israel | 2 |
| Norway | 2 |
| Thailand | 2 |
| Belgium | 1 |
| Chile | 1 |
| Colombia | 1 |
| Egypt | 1 |
| Monaco | 1 |
| Saudi Arabia | 1 |

---

## Firms to target — by country

For each neighborhood in a country, research top producers at roughly these firms (in priority order). If a firm has no clear top producer for a given neighborhood, skip and try the next firm.

### USA (global + regional)

Global luxury firms: **Sotheby's International Realty**, **Compass**, **Douglas Elliman**, **Christie's International Real Estate**, **Berkshire Hathaway HomeServices**.

Regional / market-dominant:
- **NYC & Hamptons**: Brown Harris Stevens, Corcoran, Saunders & Associates
- **California**: Coldwell Banker Global Luxury, Hilton & Hyland, The Agency, Carolwood Estates, Pacific Union, Vanguard Properties
- **Florida**: ONE Sotheby's, EWM Realty (BHHS), The Keyes Company, The Agency, Illustrated Properties
- **Illinois/Chicago**: Jameson Sotheby's, @properties Christie's, Berkshire Hathaway KoenigRubloff
- **DC/Virginia**: Washington Fine Properties, TTR Sotheby's, Long & Foster Christie's
- **Colorado (Aspen/Vail)**: Aspen Snowmass Sotheby's, Coldwell Banker Mason Morse, Slifer Smith & Frampton
- **Mountain West (Park City, Jackson Hole)**: Summit Sotheby's, Jackson Hole Sotheby's, Engel & Völkers

### Canada

- **Sotheby's International Realty Canada**, **Chestnut Park Christie's** (Toronto), **Engel & Völkers Canada**, **Royal LePage** (luxury division), **Harvey Kalles** (Toronto), **Macdonald Realty Westside** (Vancouver), **Rennie** (Vancouver), **Profusion** (Montreal)

### UK

Global firms with strong UK presence:
- **Knight Frank**, **Savills**, **Sotheby's International Realty UK** (including **Rokstone** in Mayfair/Chelsea), **Christie's International** (London)

Specialist / boutique UK:
- **Beauchamp Estates** (Mayfair/Belgravia specialists), **Wetherell** (Mayfair specialist), **Domus Nova** (Notting Hill), **Strutt & Parker** (BNP), **Hamptons**, **Fine & Country**, **Marsh & Parsons**, **JLL Residential**, **CBRE Residential**
- For Edinburgh: **Rettie & Co**, **Coulters**
- For Cotswolds: Add **Butler Sherborn**, **Jackson-Stops**

### Ireland

- **Knight Frank Ireland**, **Savills Ireland**, **Sherry FitzGerald Christie's**, **Lisney**, **DNG**, **Hooke & MacDonald** (Dublin 4), **Mullery**

### France

- **Daniel Féau** (Paris), **Barnes International** (global, French HQ), **Emile Garcin** (provincial luxury), **Sotheby's International Realty France**, **Michaël Zingraf Christie's** (Côte d'Azur), **John Taylor** (Côte d'Azur, Courchevel), **Cimalpes** (French Alps), **Junot** (Paris), **Coldwell Banker France**, **Vaneau**, **Agence Principale**, **Knight Frank France**

### Monaco

- **Savills Monaco**, **Knight Frank Monaco**, **Dotta Immobilier**, **La Costa Properties**, **Sotheby's International Realty Monaco**, **Miells & Partners**

### Switzerland

- **Ginesta** (Zurich Gold Coast), **Walde** (Zurich), **Naef Prestige Knight Frank** (Geneva), **Barnes Geneva/Zurich**, **Christie's International** (Zurich + Geneva affiliates), **Nobilis**, **Engel & Völkers Switzerland**, **La Régie** (Geneva)

### Italy

- **Engel & Völkers Italy**, **Sotheby's International Realty Italy**, **Knight Frank Italy**, **Great Estate**, **Berkshire Hathaway HomeServices Italy** (via Magnolia Quality), **Coldwell Banker Italy**, **Santandrea Luxury Houses** (Milan), **Casa.it Luxury**, **Il Mare** (Amalfi/Como), **Pirelli RE**

### Spain

- **Engel & Völkers Spain**, **Sotheby's International Realty Spain**, **Barnes Spain**, **Christie's International Spain**, **Lucas Fox** (Catalonia, Balearics), **Panorama** (Marbella), **Drumelia** (Marbella Golden Mile), **Knight Frank Spain**, **Berkshire Hathaway Larvia** (Madrid), **Vivendi** (Ibiza)

### Portugal

- **Engel & Völkers Portugal**, **Sotheby's International Realty Portugal**, **JLL Portugal**, **Fine & Country Portugal**, **Quintela + Penalva Knight Frank** (Lisbon), **Barnes Portugal**, **Savills Portugal**

### Germany / Austria

- **Engel & Völkers** (HQ in Germany, dominant), **Sotheby's International Realty Germany**, **Knight Frank Germany**, **Ziegert** (Berlin new-build luxury), **von Poll Immobilien**, **Riedel Immobilien** (Munich), **DAHLER & COMPANY** (Hamburg, pan-Germany), **Marlies Muhr Immobilien** (Vienna, Salzburg)

### Netherlands / Belgium

- **Broersma Lelieveldt** (Amsterdam luxury), **Engel & Völkers**, **Sotheby's International Realty**, **Christie's International** (NL/BE affiliates), **Immoscoop** (Brussels), **Savills Belgium**, **Van De Kamp** (Knight Frank affiliate Amsterdam)

### Scandinavia

**Sweden**: **Eklund** (Östermalm NYC), **SkandiaMäklarna**, **Bjurfors**, **Fastighetsbyrån**, **Länsförsäkringar Fastighetsförmedling**, **Svensk Fastighetsförmedling**, **Skeppsholmen Sotheby's**
**Denmark**: **Danbolig**, **Home**, **EDC**, **Nybolig**, **Estate** (Copenhagen luxury)
**Norway**: **Privatmegleren**, **DNB Eiendom**, **EiendomsMegler 1**, **Notar**, **Krogsveen**

### Greece

- **Sotheby's International Realty Greece**, **Engel & Völkers Greece**, **Savills Greece**, **Ploumis-Sotiropoulos** (Athens), **Elxis – At Home in Greece** (Mykonos/Santorini)

### Middle East (UAE, Israel, Saudi Arabia, Egypt)

**UAE (Dubai/Abu Dhabi)**: **Knight Frank Middle East**, **Savills Middle East**, **Christie's International Luxhabitat**, **Driven Properties**, **Allsopp & Allsopp**, **Betterhomes**, **Dubai Sotheby's International Realty**, **Haus & Haus**, **Provident Real Estate**
**Israel**: **Engel & Völkers Israel**, **Sotheby's International Realty Israel**, **Alfa Real Estate** (Tel Aviv), **Remax Ocean**, **Anglo-Saxon**
**Saudi Arabia**: **Knight Frank KSA**, **Savills KSA**, **JLL KSA**
**Egypt**: **Coldwell Banker Egypt**, **Engel & Völkers Cairo**, **Savills Egypt**

### Africa (South Africa)

- **Pam Golding Properties** (dominant SA luxury), **Sotheby's International Realty SA**, **Lew Geffen Sotheby's**, **Seeff Properties**, **Chas Everitt International** (Cape Town, Johannesburg), **Knight Frank Residential SA**

### APAC

**Hong Kong**: **Knight Frank HK**, **Savills HK**, **Landscope Christie's**, **Sotheby's International Realty HK**, **Habitat Property**, **Midland Realty Prime Services**, **Centaline Property Prime**, **Engel & Völkers HK**
**Singapore**: **List Sotheby's International Realty**, **Knight Frank Singapore**, **Savills Singapore**, **ERA Prestige**, **Huttons**, **PropNex Prestige**
**Tokyo / Japan**: **Sotheby's International Realty Japan**, **Ken Corporation**, **Housing Japan**, **Plaza Homes**, **Mitsui Fudosan Realty**, **Nomura Real Estate Urban Net**
**Seoul / South Korea**: **Sotheby's International Realty Korea**, **The Korea Real Estate** (프리미엄)
**China (mainland)**: **Sotheby's International Realty China**, **Savills China**, **Knight Frank China**, **JLL Residential China**, **Lianjia** (Beike) luxury division
**Thailand**: **CBRE Thailand Residential**, **Knight Frank Thailand**, **Sotheby's International Realty Thailand**, **Plus Property**
**Indonesia (Bali, Jakarta)**: **Sotheby's International Realty Indonesia**, **Ray White Bali**, **Harcourts Bali**, **Leedon Property** (Jakarta)
**Australia**: **Sotheby's International Realty Australia** (includes **Jellis Craig** in some markets), **Christie's International Real Estate Australia**, **Ray White Prestige** (Double Bay for Sydney, Toorak for Melbourne), **LJ Hooker Prestige**, **Knight Frank Australia**, **RT Edgar** (Melbourne), **Kay & Burton** (Melbourne), **Marshall White** (Melbourne), **McGrath Prestige** (Sydney), **Ballard Property Group** (Sydney East)
**New Zealand**: **Bayleys** (luxury specialist nationwide), **Sotheby's International Realty NZ**, **Barfoot & Thompson** (Auckland), **Precision Real Estate**, **Harcourts Prestige**

### Latin America

**Mexico (Mexico City, Cabo, Los Cabos, San Miguel)**: **Sotheby's International Realty Mexico**, **Engel & Völkers Mexico**, **Christie's International Real Estate Mexico**, **Coldwell Banker Mexico**
**Brazil (São Paulo, Rio)**: **Sotheby's International Realty Brazil**, **Judice & Araujo** (São Paulo), **Coldwell Banker Brazil**, **Axpe Imóveis Especiais**, **Lopes**
**Argentina (Buenos Aires)**: **Sotheby's International Realty Argentina**, **Engel & Völkers Argentina**, **Berkadia/Toribio Achával**, **Miguel Ludmer**
**Chile (Santiago)**: **Sotheby's International Realty Chile**, **Engel & Völkers Chile**, **Portal Inmobiliario Luxury**
**Colombia (Bogotá)**: **Sotheby's International Realty Colombia**, **Engel & Völkers Colombia**

---

## Where to look for emails

In this order of reliability:

1. **The broker's personal website** (many top producers have one — `leonardsteinberg.com`, `stevengold.com`, `serenaboardman.com`, `joshflagg.com`). Check the `/contact` page. Many sites use Cloudflare email obfuscation — the address is still there in the page source, just encoded.
2. **The brokerage bio page** — sometimes has direct email, sometimes only a contact form.
3. **LinkedIn public profile** — check the "Contact info" overlay.
4. **Press coverage** — Mansion Global, Curbed, The Real Deal, FT HTSI, Business of Home, Tatler, Country Life, Mansion Global International, Nikkei Real Estate, AFR luxury coverage. Top brokers are frequently quoted.
5. **Listing pages on Zillow / Rightmove / Idealista / Immobiliare.it** — agents sometimes list their email on individual property pages.
6. **Industry directory snippets** — RocketReach, Hunter.io, ZoomInfo. Use only to confirm an email you already saw elsewhere — never as a standalone source.

## Firms known to hide emails behind contact forms

- **Knight Frank** (UK HQ policy, applies globally)
- **Savills** (UK HQ policy, applies globally)
- **Sotheby's International Realty** (US corporate & many affiliates)
- **Brown Harris Stevens**, **Corcoran**, **Coldwell Banker** (US)
- **Christie's International Real Estate** (some affiliates)
- **Compass** (for agents who opt out of direct-contact display)

For these: **the agent's personal site is almost always the highest-yield path.** Top producers at these firms almost all have personal sites, and almost all display their direct email there (sometimes Cloudflare-encoded).

## Common email patterns (VERIFICATION ONLY — never invent)

Use these only to verify an email you already found on a source. **Do not invent emails from these patterns.**

- **Compass**: `firstinitial+lastname@compass.com` (Leonard Steinberg → `ls@compass.com`)
- **Knight Frank (worldwide)**: `firstname.lastname@knightfrank.com`
- **Savills (worldwide)**: `firstname.lastname@savills.com` or `firstinitial+lastname@savills.com` (long-tenured staff)
- **Sotheby's International Realty US HQ**: `firstname.lastname@sothebys.realty` OR `firstname.lastname@sothebyshomes.com` (regional affiliates, esp. California)
- **Douglas Elliman**: `firstinitial+lastname@elliman.com` (varies; sometimes just firstname)
- **Brown Harris Stevens**: `firstinitial+lastname@bhsusa.com`
- **Corcoran**: `initials@corcoran.com` (uses middle initial for some)
- **Christie's International**: varies heavily by affiliate; pattern unreliable
- **Engel & Völkers**: `firstname.lastname@engelvoelkers.com` or regional country domain (`.se`, `.de`, `.es`, etc.)
- **Sotheby's French / Italian / Spanish affiliates**: `firstname.lastname@[country]-sothebysrealty.com`
- **Barnes International**: `firstname.lastname@barnes-international.com`
- **Daniel Féau**: `firstname.lastname@danielfeau.com`
- **Emile Garcin**: `firstname.lastname@emilegarcin.fr`
- **Ray White (Australia/NZ)**: `firstname.lastname@raywhite.com` (office-specific domains possible)
- **Jellis Craig / Kay & Burton / Marshall White / RT Edgar (Melbourne)**: `firstname.lastname@[firm].com.au`
- **Bayleys (NZ)**: `firstname.lastname@bayleys.co.nz`
- **Knight Frank Middle East**: `firstname.lastname@me.knightfrank.com`
- **Pam Golding**: `firstname.lastname@pamgolding.co.za`
- **Eklund (Stockholm)**: `firstname@esny.se`
- **SkandiaMäklarna / Bjurfors / Fastighetsbyrån**: `firstname.lastname@[firm].se`

## Priority ranking guidance

- **Priority 1**: Partner / SVP / Managing Director / Founder title, multi-billion career sales, appears in RealTrends Top 1000 (USA) or equivalent market ranking, frequently quoted in luxury real estate press, listings in the target neighborhood above median
- **Priority 2**: Senior broker with clear neighborhood specialization, active listings at or above neighborhood median, 10+ years experience
- **Priority 3**: Solid producer but less public profile; include only when priorities 1–2 are not findable at that firm

## Time budget

- **Per neighborhood**: 5-10 minutes. For 251 neighborhoods × 4 brokers average = roughly 40-80 hours of research. This is too much for one Gemini session — split it into regional chunks.
- **Suggested pass order** (largest impact / easiest email discovery first):
  1. **English-speaking markets first** (USA, UK, Ireland, Canada, Australia, NZ, South Africa) — English-language sources, highest email discoverability
  2. **Western Europe** (France, Italy, Spain, Germany, Switzerland, Netherlands, Portugal, Belgium)
  3. **Scandinavia** (Sweden, Denmark, Norway) — Swedish firms publish emails openly
  4. **Middle East + APAC** (UAE, Israel, HK, Singapore, Tokyo, etc.)
  5. **Latin America** (Mexico, Brazil, Argentina, Chile, Colombia)
- If you must cut short, return whatever is verified and note which regions are incomplete.

## Deliverable

Paste the full CSV back to me in the chat. Or, if output is too large, split into regional CSVs (e.g. `targets-usa.csv`, `targets-europe.csv`, `targets-apac.csv`) and return them sequentially. I'll concatenate them.

**At the end, include a summary block:**
- Total rows written
- Rows with verified direct emails
- Rows left blank (email not publicly printed)
- Any neighborhoods where you couldn't find even 2 brokers
- Research leads flagged for phone follow-up (brokers at firms that truly don't publish emails anywhere — I'll call their offices)

---

*Reference: the send pipeline that will consume this CSV is at [github.com/morgandowney-droid/readflaneur-web/blob/master/scripts/send-broker-pitches.mjs](https://github.com/morgandowney-droid/readflaneur-web/blob/master/scripts/send-broker-pitches.mjs). The pitch copy also auto-localizes based on `neighborhood_id` — e.g. Paris brokers get a cold pitch referencing Le Figaro and Les Echos; Tokyo brokers get Nikkei; Hong Kong brokers get South China Morning Post. You don't need to do anything for localization — it happens automatically at send time based on the prefix of `neighborhood_id`.*
