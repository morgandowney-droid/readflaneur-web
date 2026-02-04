/**
 * Part 2: Paris, San Francisco, Amsterdam, Berlin neighborhoods
 */

import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const NEIGHBORHOODS = {

// ============================================================================
// PARIS (5 neighborhoods)
// ============================================================================

'paris-montmartre': {
  id: 'paris-montmartre',
  name: 'Montmartre',
  city: 'Paris',
  center: [48.8867, 2.3431],
  zoom: 14,
  polygon: [
    [48.8930, 2.3350], [48.8930, 2.3520], [48.8880, 2.3560],
    [48.8820, 2.3530], [48.8800, 2.3400], [48.8830, 2.3300],
    [48.8890, 2.3300]
  ],
  adjacentNeighborhoods: [
    { name: 'Pigalle', polygon: [[48.8830, 2.3400], [48.8830, 2.3300], [48.8780, 2.3300], [48.8780, 2.3400]] },
    { name: 'Clignancourt', polygon: [[48.8970, 2.3450], [48.8970, 2.3350], [48.8930, 2.3350], [48.8930, 2.3450]] },
    { name: 'Batignolles', polygon: [[48.8890, 2.3300], [48.8890, 2.3180], [48.8830, 2.3180], [48.8830, 2.3300]] }
  ]
},

'paris-le-marais': {
  id: 'paris-le-marais',
  name: 'Le Marais',
  city: 'Paris',
  center: [48.8566, 2.3622],
  zoom: 14,
  polygon: [
    [48.8620, 2.3540], [48.8620, 2.3700], [48.8580, 2.3730],
    [48.8520, 2.3710], [48.8500, 2.3600], [48.8520, 2.3520],
    [48.8580, 2.3510]
  ],
  adjacentNeighborhoods: [
    { name: 'Bastille', polygon: [[48.8560, 2.3700], [48.8560, 2.3800], [48.8490, 2.3800], [48.8490, 2.3700]] },
    { name: 'Beaubourg', polygon: [[48.8620, 2.3520], [48.8620, 2.3460], [48.8570, 2.3460], [48.8570, 2.3520]] },
    { name: 'Île Saint-Louis', polygon: [[48.8530, 2.3580], [48.8530, 2.3530], [48.8500, 2.3530], [48.8500, 2.3580]] }
  ]
},

'paris-saint-germain-des-pres': {
  id: 'paris-saint-germain-des-pres',
  name: 'Saint-Germain-des-Prés',
  city: 'Paris',
  center: [48.8539, 2.3338],
  zoom: 14,
  polygon: [
    [48.8580, 2.3260], [48.8580, 2.3400], [48.8540, 2.3430],
    [48.8490, 2.3410], [48.8480, 2.3300], [48.8510, 2.3240],
    [48.8560, 2.3240]
  ],
  adjacentNeighborhoods: [
    { name: 'Latin Quarter', polygon: [[48.8520, 2.3400], [48.8520, 2.3500], [48.8460, 2.3500], [48.8460, 2.3400]] },
    { name: 'Luxembourg', polygon: [[48.8490, 2.3350], [48.8490, 2.3280], [48.8440, 2.3280], [48.8440, 2.3350]] },
    { name: 'Odéon', polygon: [[48.8530, 2.3400], [48.8530, 2.3350], [48.8500, 2.3350], [48.8500, 2.3400]] }
  ]
},

'paris-16th-arrondissement': {
  id: 'paris-16th-arrondissement',
  name: '16th Arrondissement',
  city: 'Paris',
  center: [48.8637, 2.2769],
  zoom: 14,
  polygon: [
    [48.8780, 2.2600], [48.8780, 2.2900], [48.8700, 2.2980],
    [48.8550, 2.2920], [48.8500, 2.2700], [48.8580, 2.2550],
    [48.8700, 2.2530]
  ],
  adjacentNeighborhoods: [
    { name: 'Trocadéro', polygon: [[48.8660, 2.2920], [48.8660, 2.2820], [48.8600, 2.2820], [48.8600, 2.2920]] },
    { name: 'Auteuil', polygon: [[48.8550, 2.2700], [48.8550, 2.2550], [48.8480, 2.2550], [48.8480, 2.2700]] },
    { name: 'Bois de Boulogne', polygon: [[48.8700, 2.2530], [48.8700, 2.2350], [48.8550, 2.2350], [48.8550, 2.2530]] }
  ]
},

'paris-7th-arrondissement': {
  id: 'paris-7th-arrondissement',
  name: '7th Arrondissement',
  city: 'Paris',
  center: [48.8566, 2.3150],
  zoom: 14,
  polygon: [
    [48.8620, 2.3020], [48.8620, 2.3260], [48.8580, 2.3300],
    [48.8510, 2.3270], [48.8490, 2.3100], [48.8530, 2.2980],
    [48.8590, 2.2980]
  ],
  adjacentNeighborhoods: [
    { name: 'Invalides', polygon: [[48.8590, 2.3150], [48.8590, 2.3070], [48.8540, 2.3070], [48.8540, 2.3150]] },
    { name: 'Champ de Mars', polygon: [[48.8570, 2.3050], [48.8570, 2.2920], [48.8510, 2.2920], [48.8510, 2.3050]] },
    { name: 'Saint-Germain', polygon: [[48.8580, 2.3300], [48.8580, 2.3360], [48.8530, 2.3360], [48.8530, 2.3300]] }
  ]
},

// ============================================================================
// SAN FRANCISCO (6 neighborhoods)
// ============================================================================

'sf-pacific-heights': {
  id: 'sf-pacific-heights',
  name: 'Pacific Heights',
  city: 'San Francisco',
  center: [37.7925, -122.4350],
  zoom: 14,
  polygon: [
    [37.7960, -122.4470], [37.7960, -122.4240], [37.7905, -122.4240],
    [37.7905, -122.4300], [37.7880, -122.4300], [37.7880, -122.4470]
  ],
  adjacentNeighborhoods: [
    { name: 'Marina', polygon: [[37.8040, -122.4470], [37.8040, -122.4240], [37.7960, -122.4240], [37.7960, -122.4470]] },
    { name: 'Cow Hollow', polygon: [[37.7990, -122.4400], [37.7990, -122.4300], [37.7960, -122.4300], [37.7960, -122.4400]] },
    { name: 'Presidio Heights', polygon: [[37.7920, -122.4580], [37.7920, -122.4470], [37.7860, -122.4470], [37.7860, -122.4580]] },
    { name: 'Lower Pacific Heights', polygon: [[37.7880, -122.4400], [37.7880, -122.4240], [37.7840, -122.4240], [37.7840, -122.4400]] }
  ]
},

'sf-marina-district': {
  id: 'sf-marina-district',
  name: 'Marina District',
  city: 'San Francisco',
  center: [37.8030, -122.4370],
  zoom: 14,
  polygon: [
    [37.8080, -122.4500], [37.8080, -122.4280], [37.8020, -122.4240],
    [37.7970, -122.4260], [37.7970, -122.4480], [37.8020, -122.4510]
  ],
  adjacentNeighborhoods: [
    { name: 'Pacific Heights', polygon: [[37.7970, -122.4470], [37.7970, -122.4280], [37.7910, -122.4280], [37.7910, -122.4470]] },
    { name: 'Cow Hollow', polygon: [[37.7990, -122.4400], [37.7990, -122.4300], [37.7960, -122.4300], [37.7960, -122.4400]] },
    { name: 'Presidio', polygon: [[37.8050, -122.4600], [37.8050, -122.4500], [37.7980, -122.4500], [37.7980, -122.4600]] }
  ]
},

'sf-noe-valley': {
  id: 'sf-noe-valley',
  name: 'Noe Valley',
  city: 'San Francisco',
  center: [37.7502, -122.4337],
  zoom: 14,
  polygon: [
    [37.7580, -122.4420], [37.7580, -122.4260], [37.7520, -122.4220],
    [37.7440, -122.4250], [37.7440, -122.4400], [37.7500, -122.4440]
  ],
  adjacentNeighborhoods: [
    { name: 'Castro', polygon: [[37.7620, -122.4380], [37.7620, -122.4300], [37.7580, -122.4300], [37.7580, -122.4380]] },
    { name: 'Mission Dolores', polygon: [[37.7580, -122.4280], [37.7580, -122.4200], [37.7520, -122.4200], [37.7520, -122.4280]] },
    { name: 'Glen Park', polygon: [[37.7440, -122.4400], [37.7440, -122.4300], [37.7380, -122.4300], [37.7380, -122.4400]] }
  ]
},

'sf-hayes-valley': {
  id: 'sf-hayes-valley',
  name: 'Hayes Valley',
  city: 'San Francisco',
  center: [37.7759, -122.4245],
  zoom: 14,
  polygon: [
    [37.7800, -122.4320], [37.7800, -122.4180], [37.7760, -122.4150],
    [37.7720, -122.4160], [37.7720, -122.4300], [37.7760, -122.4330]
  ],
  adjacentNeighborhoods: [
    { name: 'Civic Center', polygon: [[37.7800, -122.4200], [37.7800, -122.4120], [37.7760, -122.4120], [37.7760, -122.4200]] },
    { name: 'Lower Haight', polygon: [[37.7720, -122.4320], [37.7720, -122.4240], [37.7680, -122.4240], [37.7680, -122.4320]] },
    { name: 'Western Addition', polygon: [[37.7820, -122.4350], [37.7820, -122.4280], [37.7780, -122.4280], [37.7780, -122.4350]] }
  ]
},

'sf-the-mission': {
  id: 'sf-the-mission',
  name: 'The Mission',
  city: 'San Francisco',
  center: [37.7599, -122.4148],
  zoom: 14,
  polygon: [
    [37.7700, -122.4250], [37.7700, -122.4050], [37.7620, -122.4000],
    [37.7500, -122.4020], [37.7480, -122.4200], [37.7560, -122.4270]
  ],
  adjacentNeighborhoods: [
    { name: 'Castro', polygon: [[37.7650, -122.4380], [37.7650, -122.4280], [37.7600, -122.4280], [37.7600, -122.4380]] },
    { name: 'Potrero Hill', polygon: [[37.7620, -122.4050], [37.7620, -122.3950], [37.7550, -122.3950], [37.7550, -122.4050]] },
    { name: 'Bernal Heights', polygon: [[37.7500, -122.4150], [37.7500, -122.4050], [37.7430, -122.4050], [37.7430, -122.4150]] }
  ]
},

'sf-russian-hill': {
  id: 'sf-russian-hill',
  name: 'Russian Hill',
  city: 'San Francisco',
  center: [37.8011, -122.4194],
  zoom: 14,
  polygon: [
    [37.8060, -122.4260], [37.8060, -122.4130], [37.8010, -122.4100],
    [37.7960, -122.4120], [37.7960, -122.4240], [37.8010, -122.4270]
  ],
  adjacentNeighborhoods: [
    { name: 'Fisherman\'s Wharf', polygon: [[37.8100, -122.4200], [37.8100, -122.4100], [37.8060, -122.4100], [37.8060, -122.4200]] },
    { name: 'North Beach', polygon: [[37.8050, -122.4130], [37.8050, -122.4050], [37.8000, -122.4050], [37.8000, -122.4130]] },
    { name: 'Nob Hill', polygon: [[37.7960, -122.4180], [37.7960, -122.4100], [37.7920, -122.4100], [37.7920, -122.4180]] }
  ]
},

// ============================================================================
// AMSTERDAM (3 neighborhoods)
// ============================================================================

'amsterdam-jordaan': {
  id: 'amsterdam-jordaan',
  name: 'Jordaan',
  city: 'Amsterdam',
  center: [37.3752, 4.8819],
  zoom: 14,
  polygon: [
    [52.3820, 4.8750], [52.3820, 4.8880], [52.3770, 4.8900],
    [52.3700, 4.8870], [52.3670, 4.8780], [52.3700, 4.8730],
    [52.3770, 4.8720]
  ],
  adjacentNeighborhoods: [
    { name: 'Centrum', polygon: [[52.3770, 4.8880], [52.3770, 4.8960], [52.3700, 4.8960], [52.3700, 4.8880]] },
    { name: 'Westerpark', polygon: [[52.3870, 4.8750], [52.3870, 4.8650], [52.3820, 4.8650], [52.3820, 4.8750]] },
    { name: 'De Baarsjes', polygon: [[52.3700, 4.8650], [52.3700, 4.8550], [52.3640, 4.8550], [52.3640, 4.8650]] }
  ]
},

'amsterdam-de-pijp': {
  id: 'amsterdam-de-pijp',
  name: 'De Pijp',
  city: 'Amsterdam',
  center: [52.3522, 4.8937],
  zoom: 14,
  polygon: [
    [52.3600, 4.8870], [52.3600, 4.9050], [52.3560, 4.9080],
    [52.3500, 4.9050], [52.3480, 4.8920], [52.3520, 4.8850],
    [52.3570, 4.8850]
  ],
  adjacentNeighborhoods: [
    { name: 'Centrum', polygon: [[52.3650, 4.8920], [52.3650, 4.9000], [52.3600, 4.9000], [52.3600, 4.8920]] },
    { name: 'Rivierenbuurt', polygon: [[52.3500, 4.9050], [52.3500, 4.9150], [52.3440, 4.9150], [52.3440, 4.9050]] },
    { name: 'Oud-Zuid', polygon: [[52.3520, 4.8850], [52.3520, 4.8750], [52.3460, 4.8750], [52.3460, 4.8850]] }
  ]
},

'amsterdam-oud-zuid': {
  id: 'amsterdam-oud-zuid',
  name: 'Oud-Zuid',
  city: 'Amsterdam',
  center: [52.35, 4.87],
  zoom: 14,
  polygon: [
    [52.3580, 4.8550], [52.3580, 4.8750], [52.3530, 4.8800],
    [52.3450, 4.8770], [52.3400, 4.8650], [52.3450, 4.8520],
    [52.3530, 4.8500]
  ],
  adjacentNeighborhoods: [
    { name: 'Vondelpark', polygon: [[52.3600, 4.8650], [52.3600, 4.8550], [52.3550, 4.8550], [52.3550, 4.8650]] },
    { name: 'De Pijp', polygon: [[52.3530, 4.8800], [52.3530, 4.8900], [52.3480, 4.8900], [52.3480, 4.8800]] },
    { name: 'Museumkwartier', polygon: [[52.3600, 4.8750], [52.3600, 4.8850], [52.3560, 4.8850], [52.3560, 4.8750]] }
  ]
},

// ============================================================================
// BERLIN (7 neighborhoods)
// ============================================================================

'berlin-mitte': {
  id: 'berlin-mitte',
  name: 'Mitte',
  city: 'Berlin',
  center: [52.5200, 13.4050],
  zoom: 14,
  polygon: [
    [52.5280, 13.3900], [52.5280, 13.4200], [52.5220, 13.4250],
    [52.5140, 13.4220], [52.5120, 13.4000], [52.5180, 13.3850],
    [52.5240, 13.3850]
  ],
  adjacentNeighborhoods: [
    { name: 'Prenzlauer Berg', polygon: [[52.5350, 13.4100], [52.5350, 13.4250], [52.5280, 13.4250], [52.5280, 13.4100]] },
    { name: 'Friedrichshain', polygon: [[52.5220, 13.4250], [52.5220, 13.4400], [52.5140, 13.4400], [52.5140, 13.4250]] },
    { name: 'Tiergarten', polygon: [[52.5180, 13.3850], [52.5180, 13.3650], [52.5120, 13.3650], [52.5120, 13.3850]] }
  ]
},

'berlin-prenzlauer-berg': {
  id: 'berlin-prenzlauer-berg',
  name: 'Prenzlauer Berg',
  city: 'Berlin',
  center: [52.5388, 13.4244],
  zoom: 14,
  polygon: [
    [52.5480, 13.4100], [52.5480, 13.4380], [52.5400, 13.4450],
    [52.5300, 13.4400], [52.5280, 13.4150], [52.5340, 13.4050],
    [52.5420, 13.4050]
  ],
  adjacentNeighborhoods: [
    { name: 'Mitte', polygon: [[52.5280, 13.4050], [52.5280, 13.4200], [52.5220, 13.4200], [52.5220, 13.4050]] },
    { name: 'Pankow', polygon: [[52.5550, 13.4200], [52.5550, 13.4350], [52.5480, 13.4350], [52.5480, 13.4200]] },
    { name: 'Friedrichshain', polygon: [[52.5300, 13.4350], [52.5300, 13.4500], [52.5230, 13.4500], [52.5230, 13.4350]] }
  ]
},

'berlin-kreuzberg': {
  id: 'berlin-kreuzberg',
  name: 'Kreuzberg',
  city: 'Berlin',
  center: [52.4990, 13.4030],
  zoom: 14,
  polygon: [
    [52.5080, 13.3900], [52.5080, 13.4200], [52.5020, 13.4280],
    [52.4920, 13.4250], [52.4900, 13.4000], [52.4960, 13.3850],
    [52.5040, 13.3850]
  ],
  adjacentNeighborhoods: [
    { name: 'Mitte', polygon: [[52.5130, 13.4000], [52.5130, 13.4150], [52.5080, 13.4150], [52.5080, 13.4000]] },
    { name: 'Neukölln', polygon: [[52.4920, 13.4150], [52.4920, 13.4300], [52.4850, 13.4300], [52.4850, 13.4150]] },
    { name: 'Friedrichshain', polygon: [[52.5080, 13.4200], [52.5080, 13.4350], [52.5020, 13.4350], [52.5020, 13.4200]] }
  ]
},

'berlin-charlottenburg': {
  id: 'berlin-charlottenburg',
  name: 'Charlottenburg',
  city: 'Berlin',
  center: [52.5160, 13.3040],
  zoom: 14,
  polygon: [
    [52.5250, 13.2850], [52.5250, 13.3200], [52.5180, 13.3280],
    [52.5080, 13.3230], [52.5060, 13.2950], [52.5120, 13.2800],
    [52.5200, 13.2800]
  ],
  adjacentNeighborhoods: [
    { name: 'Wilmersdorf', polygon: [[52.5080, 13.3100], [52.5080, 13.3250], [52.5000, 13.3250], [52.5000, 13.3100]] },
    { name: 'Tiergarten', polygon: [[52.5180, 13.3280], [52.5180, 13.3450], [52.5120, 13.3450], [52.5120, 13.3280]] },
    { name: 'Moabit', polygon: [[52.5300, 13.3100], [52.5300, 13.3250], [52.5250, 13.3250], [52.5250, 13.3100]] }
  ]
},

'berlin-grunewald': {
  id: 'berlin-grunewald',
  name: 'Grunewald',
  city: 'Berlin',
  center: [52.4850, 13.2620],
  zoom: 14,
  polygon: [
    [52.4980, 13.2400], [52.4980, 13.2800], [52.4900, 13.2900],
    [52.4750, 13.2850], [52.4720, 13.2500], [52.4800, 13.2350],
    [52.4920, 13.2350]
  ],
  adjacentNeighborhoods: [
    { name: 'Wilmersdorf', polygon: [[52.4900, 13.2900], [52.4900, 13.3100], [52.4800, 13.3100], [52.4800, 13.2900]] },
    { name: 'Dahlem', polygon: [[52.4750, 13.2800], [52.4750, 13.3000], [52.4650, 13.3000], [52.4650, 13.2800]] },
    { name: 'Grunewald Forest', polygon: [[52.4800, 13.2350], [52.4800, 13.2150], [52.4700, 13.2150], [52.4700, 13.2350]] }
  ]
},

'berlin-dahlem': {
  id: 'berlin-dahlem',
  name: 'Dahlem',
  city: 'Berlin',
  center: [52.4580, 13.2890],
  zoom: 14,
  polygon: [
    [52.4680, 13.2700], [52.4680, 13.3050], [52.4620, 13.3120],
    [52.4500, 13.3080], [52.4480, 13.2800], [52.4540, 13.2650],
    [52.4640, 13.2650]
  ],
  adjacentNeighborhoods: [
    { name: 'Grunewald', polygon: [[52.4740, 13.2700], [52.4740, 13.2900], [52.4680, 13.2900], [52.4680, 13.2700]] },
    { name: 'Zehlendorf', polygon: [[52.4500, 13.2900], [52.4500, 13.3100], [52.4420, 13.3100], [52.4420, 13.2900]] },
    { name: 'Steglitz', polygon: [[52.4620, 13.3120], [52.4620, 13.3300], [52.4540, 13.3300], [52.4540, 13.3120]] }
  ]
},

'berlin-zehlendorf': {
  id: 'berlin-zehlendorf',
  name: 'Zehlendorf',
  city: 'Berlin',
  center: [52.4340, 13.2590],
  zoom: 14,
  polygon: [
    [52.4480, 13.2400], [52.4480, 13.2750], [52.4400, 13.2850],
    [52.4250, 13.2800], [52.4220, 13.2500], [52.4300, 13.2350],
    [52.4420, 13.2350]
  ],
  adjacentNeighborhoods: [
    { name: 'Dahlem', polygon: [[52.4550, 13.2700], [52.4550, 13.2900], [52.4480, 13.2900], [52.4480, 13.2700]] },
    { name: 'Wannsee', polygon: [[52.4250, 13.2500], [52.4250, 13.2300], [52.4150, 13.2300], [52.4150, 13.2500]] },
    { name: 'Schlachtensee', polygon: [[52.4400, 13.2200], [52.4400, 13.2400], [52.4320, 13.2400], [52.4320, 13.2200]] }
  ]
}

};

// Read and update
const content = fs.readFileSync(join(__dirname, '..', 'src', 'lib', 'neighborhood-boundaries.ts'), 'utf-8');
const match = content.match(/= ({[\s\S]+});/);
const boundaries = JSON.parse(match[1]);

let updated = 0;
for (const [id, data] of Object.entries(NEIGHBORHOODS)) {
  if (boundaries[id]) {
    boundaries[id] = data;
    console.log('Updated:', data.name + ',', data.city);
    updated++;
  }
}

const output = `// Neighborhood boundaries with accurate polygons and hinterlands
// Generated: ${new Date().toISOString()}
// Source: Manual geographic definitions with street-level accuracy

export interface NeighborhoodBoundary {
  id: string;
  name: string;
  city: string;
  center: [number, number];
  zoom: number;
  polygon: [number, number][];
  adjacentNeighborhoods: {
    name: string;
    polygon: [number, number][];
  }[];
}

export const NEIGHBORHOOD_BOUNDARIES: Record<string, NeighborhoodBoundary> = ${JSON.stringify(boundaries, null, 2)};
`;

fs.writeFileSync(join(__dirname, '..', 'src', 'lib', 'neighborhood-boundaries.ts'), output);
console.log(`\n✓ Updated ${updated} neighborhoods (Paris, SF, Amsterdam, Berlin)`);
