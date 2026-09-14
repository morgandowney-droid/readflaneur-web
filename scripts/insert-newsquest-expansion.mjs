// Newsquest follow-up editions, named on the 2026-09-14 call.
//
// Henry Faure Walker asked Richard Porritt to take Birmingham and the
// "expansion markets" forward. They were not sure whether Birmingham should be
// covered by district or as one city, so both are built: deciding that in the
// abstract is harder than looking at two pages.
//
//   westmidlands-birmingham        one edition for the whole city
//   birmingham-sutton-coldfield    one district of it, with its own identity
//   lanarkshire-east-kilbride      an expansion market with no Newsquest title
//   cornwall-helston               Simon's patch, where he asked how geography
//                                  and sourcing are defined
//
// `city` and `broader_area` carry the disambiguation. Birmingham, Alabama is
// far better indexed than Birmingham, England, and an ambiguous `city` is what
// put Lewes, Delaware into a UK edition in September.
//
// Usage:
//   node scripts/insert-newsquest-expansion.mjs            # dry run
//   node scripts/insert-newsquest-expansion.mjs --confirm

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local', quiet: true });
import { createClient } from '@supabase/supabase-js';

const CONFIRM = process.argv.includes('--confirm');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const ROWS = [
  {
    id: 'westmidlands-birmingham',
    name: 'Birmingham',
    city: 'West Midlands',
    country: 'United Kingdom',
    timezone: 'Europe/London',
    latitude: 52.4862,
    longitude: -1.8904,
    broader_area: 'West Midlands, England',
    region: 'test',
    is_active: true,
    radius: 8000,
  },
  {
    id: 'birmingham-sutton-coldfield',
    name: 'Sutton Coldfield',
    city: 'West Midlands',
    country: 'United Kingdom',
    timezone: 'Europe/London',
    latitude: 52.5637,
    longitude: -1.8249,
    broader_area: 'Birmingham, West Midlands, England',
    region: 'test',
    is_active: true,
    radius: 3000,
  },
  // The neighbourhoods of Birmingham. BirminghamLive covers the city; the wards
  // and high streets are where the coverage thins out, which is the whole case.
  {
    id: 'birmingham-moseley',
    name: 'Moseley',
    city: 'Birmingham',
    country: 'United Kingdom',
    timezone: 'Europe/London',
    latitude: 52.4453,
    longitude: -1.8869,
    broader_area: 'Birmingham, West Midlands, England',
    region: 'test',
    is_active: true,
    radius: 2000,
  },
  {
    id: 'birmingham-kings-heath',
    name: 'Kings Heath',
    city: 'Birmingham',
    country: 'United Kingdom',
    timezone: 'Europe/London',
    latitude: 52.4370,
    longitude: -1.8930,
    broader_area: 'Birmingham, West Midlands, England',
    region: 'test',
    is_active: true,
    radius: 2000,
  },
  {
    id: 'birmingham-harborne',
    name: 'Harborne',
    city: 'Birmingham',
    country: 'United Kingdom',
    timezone: 'Europe/London',
    latitude: 52.4594,
    longitude: -1.9520,
    broader_area: 'Birmingham, West Midlands, England',
    region: 'test',
    is_active: true,
    radius: 2000,
  },
  {
    id: 'birmingham-erdington',
    name: 'Erdington',
    city: 'Birmingham',
    country: 'United Kingdom',
    timezone: 'Europe/London',
    latitude: 52.5237,
    longitude: -1.8360,
    broader_area: 'Birmingham, West Midlands, England',
    region: 'test',
    is_active: true,
    radius: 2000,
  },
  {
    id: 'birmingham-digbeth',
    name: 'Digbeth',
    city: 'Birmingham',
    country: 'United Kingdom',
    timezone: 'Europe/London',
    latitude: 52.4747,
    longitude: -1.8828,
    broader_area: 'Birmingham, West Midlands, England',
    region: 'test',
    is_active: true,
    radius: 1500,
  },
  {
    id: 'lanarkshire-east-kilbride',
    name: 'East Kilbride',
    city: 'South Lanarkshire',
    country: 'United Kingdom',
    timezone: 'Europe/London',
    latitude: 55.7644,
    longitude: -4.1769,
    broader_area: 'South Lanarkshire, Scotland',
    region: 'test',
    is_active: true,
    radius: 3000,
  },
  {
    id: 'cornwall-helston',
    name: 'Helston',
    city: 'Cornwall',
    country: 'United Kingdom',
    timezone: 'Europe/London',
    latitude: 50.1011,
    longitude: -5.2747,
    broader_area: 'Cornwall, England',
    region: 'test',
    is_active: true,
    radius: 3000,
  },
];

for (const row of ROWS) {
  const { data: existing } = await sb.from('neighborhoods').select('id').eq('id', row.id).maybeSingle();
  console.log(`${existing ? 'EXISTS' : 'NEW   '}  ${row.id.padEnd(30)} ${row.name}, ${row.city}`);
  if (!CONFIRM) continue;
  const { error } = await sb.from('neighborhoods').upsert(row, { onConflict: 'id' });
  if (error) console.error(`   failed: ${error.message}`);
}

if (!CONFIRM) console.log('\nDry run. Re-run with --confirm to write.');
else console.log('\nWritten. Add the ids to PILOT_NEIGHBORHOOD_IDS, then force the crons.');
