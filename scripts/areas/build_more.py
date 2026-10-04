"""
Edition maps for Ireland, Australia, New Zealand, New York City and
Washington DC, in the same format as data/areas/de.json and uk.json, plus a
`timezone` per area (Australia spans several).

  Ireland     CSO Local Electoral Areas 2022 (166, ~31,000 people each): one
              edition per LEA. Population: the county's Census 2022 total
              (CSO table F1001) shared across its LEAs, marked as an estimate.
  Australia   ABS Statistical Area 2 (2021 ASGS) with 2025 estimated resident
              population (ABS_ANNUAL_ERP_ASGS2021), grouped inside each SA3.
  New Zealand Stats NZ Statistical Area 2 2023 with 2023 Census counts, each
              placed in its territorial authority (Territorial Authority 2023,
              point in polygon) and grouped inside it; names drop the
              directional suffix ("Grey Lynn Central" reads "Grey Lynn").
  New York    NYC Planning 2020 Neighborhood Tabulation Areas, residential only
              (197): one edition each. Population: each borough's 2020 Census
              total shared across its residential NTAs, marked as an estimate.
  Washington  DC Neighborhood Clusters 1-39 (40-46 are the Mall, parks, bases
              and campuses): one edition each, 2020 Census total shared, estimate.

Usage: python scripts/areas/build_more.py <raw_dir> [out_dir]
"""
import csv, json, math, os, re, statistics, sys, unicodedata
from collections import Counter, defaultdict

FLOOR, TARGET, MERGE_STOP, MERGE_CAP = 10_000, 25_000, 20_000, 40_000


def slug(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')


def dist_km(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


def pop_of(ms):
    return sum(m['pop'] for m in ms)


def centroid(ms):
    p = pop_of(ms) or 1
    return (sum(m['lat'] * m['pop'] for m in ms) / p, sum(m['lng'] * m['pop'] for m in ms) / p)


def title(s):
    small = {'and', 'of', 'the', 'upon', 'on', 'in'}
    return ' '.join(w.capitalize() if i == 0 or w.lower() not in small else w.lower() for i, w in enumerate(s.lower().split()))


def group_name(ms):
    names = []
    for m in sorted(ms, key=lambda m: -m['pop']):
        if m['name'] not in names:
            names.append(m['name'])
    if len(names) == 1:
        return names[0]
    if len(names) == 2:
        return f'{names[0]} and {names[1]}'
    if len(names) == 3:
        return f'{names[0]}, {names[1]} and {names[2]}'
    return f'{names[0]} and nearby'


def group(units, local_reach=False):
    """Nearest-neighbour grouping to the target, within a reach scaled to spacing:
    one reach for the whole set, or (local_reach) each seed's own spacing."""
    if len(units) <= 1:
        return [units] if units else []
    nn = {}
    for u in units:
        nn[id(u)] = min(dist_km((u['lat'], u['lng']), (v['lat'], v['lng'])) for v in units if v is not u)
    shared = max(2.5, 3 * statistics.median(nn.values()))
    pool = sorted(units, key=lambda u: -u['pop'])
    groups = []
    while pool:
        seed = pool.pop(0)
        reach = max(2.5, 3 * nn[id(seed)]) if local_reach else shared
        grp = [seed]
        while pop_of(grp) < MERGE_STOP and pool:
            c = centroid(grp)
            pool.sort(key=lambda u: dist_km(c, (u['lat'], u['lng'])))
            nxt = next((u for u in pool if pop_of(grp) + u['pop'] <= MERGE_CAP and dist_km(c, (u['lat'], u['lng'])) <= reach), None)
            if not nxt:
                break
            pool.remove(nxt)
            grp.append(nxt)
        groups.append(grp)
    while True:
        moved = False
        for g in sorted((g for g in groups if pop_of(g) < FLOOR), key=pop_of):
            c = centroid(g)
            reach = max(2.5, 3 * nn[id(g[0])]) if local_reach else shared
            near = [o for o in groups if o is not g and dist_km(c, centroid(o)) <= reach * 1.5 and pop_of(o) + pop_of(g) <= MERGE_CAP + FLOOR]
            if near:
                o = min(near, key=lambda o: dist_km(c, centroid(o)))
                o.extend(g)
                groups.remove(g)
                moved = True
                break
        if not moved:
            break
    return groups


def area(prefix, g, kind, kreis, land, country, timezone, qualifier, seen, estimated=False, name=None):
    g.sort(key=lambda m: -m['pop'])
    base = f"{prefix}-{slug(kreis)}-{slug(g[0]['name'])}" if kreis else f"{prefix}-{slug(g[0]['name'])}"
    aid, i = base, 2
    while aid in seen:
        aid, i = f'{base}-{i}', i + 1
    seen.add(aid)
    c = centroid(g)
    return {
        'id': aid, 'kind': kind, 'name': name or group_name(g), 'kreis': kreis, 'land': land, 'country': country,
        'timezone': timezone, 'population': pop_of(g), 'population_estimated': estimated, 'lat': round(c[0], 5), 'lng': round(c[1], 5),
        'split_into': 1,
        'members': [{'code': m['code'], 'name': m['name'], 'qualified': f"{m['name']} ({qualifier})", 'pop': m['pop']} for m in g],
    }


def ireland(raw):
    leas = json.load(open(os.path.join(raw, 'ie-lea.json'), encoding='utf-8'))
    county_pop = json.load(open(os.path.join(raw, 'ie-county-pop.json'), encoding='utf-8'))
    per = Counter(l['COUNTY'] for l in leas)
    seen, out = set(), []
    for l in leas:
        county = title(l['COUNTY'])
        m = {'code': l['LEA_ID'], 'name': title(l['CSO_LEA']), 'pop': county_pop[county] // per[l['COUNTY']], 'lat': l['centre'][0], 'lng': l['centre'][1]}
        out.append(area('ie', [m], 'lea', county, county, 'Ireland', 'Europe/Dublin', f'County {county}', seen, estimated=True))
    return out


AU_TZ = {'New South Wales': 'Australia/Sydney', 'Australian Capital Territory': 'Australia/Sydney', 'Victoria': 'Australia/Melbourne',
         'Queensland': 'Australia/Brisbane', 'South Australia': 'Australia/Adelaide', 'Western Australia': 'Australia/Perth',
         'Tasmania': 'Australia/Hobart', 'Northern Territory': 'Australia/Darwin', 'Other Territories': 'Australia/Sydney'}


def australia(raw):
    pop = {}
    with open(os.path.join(raw, 'au-erp.csv'), encoding='utf-8') as f:
        for r in csv.DictReader(f):
            pop[r['ASGS_2021']] = int(float(r['OBS_VALUE'] or 0))
    by_sa3 = defaultdict(list)
    for s in json.load(open(os.path.join(raw, 'au-sa2.json'), encoding='utf-8')):
        p = pop.get(s['sa2_code_2021'], 0)
        if p < 100 or not s.get('centre'):
            continue  # offshore, migratory, no usual address, or uninhabited
        by_sa3[(s['state_name_2021'], s['sa3_name_2021'])].append({'code': s['sa2_code_2021'], 'name': s['sa2_name_2021'], 'pop': p,
                                                                    'lat': s['centre'][0], 'lng': s['centre'][1]})
    seen, out = set(), []
    for (state, sa3), us in sorted(by_sa3.items()):
        for g in group(us):
            out.append(area('au', g, 'sa2-group', sa3, state, 'Australia', AU_TZ.get(state, 'Australia/Sydney'), f'{sa3}, {state}', seen))
    return out


def inside(pt, rings):
    """Point-in-polygon by ray casting over every ring (lat, lng point; rings in lng, lat)."""
    lat, lng = pt
    hit = False
    for ring in rings:
        for i in range(len(ring)):
            x1, y1 = ring[i - 1]
            x2, y2 = ring[i]
            if (y1 > lat) != (y2 > lat) and lng < (x2 - x1) * (lat - y1) / ((y2 - y1) or 1e-12) + x1:
                hit = not hit
    return hit


DIRECTION = re.compile(r'\s+(Central|North|South|East|West|North East|North West|South East|South West|Northeast|Northwest|Southeast|Southwest|Inner|Outer)$')


def new_zealand(raw):
    tas = [t for t in json.load(open(os.path.join(raw, 'nz-ta.json'), encoding='utf-8')) if t['rings'] and t['name'] != 'Area Outside Territorial Authority']
    units = []
    for s in json.load(open(os.path.join(raw, 'nz-sa2.json'), encoding='utf-8')):
        p = s.get('VAR_1_3') or 0
        if p < 200 or not s.get('centre'):
            continue  # oceanic, inlets and other unpopulated areas
        pt = (s['centre'][0], s['centre'][1])
        ta = next((t['name'] for t in tas if inside(pt, t['rings'])), None)
        if not ta:  # a centre just offshore: nearest council by first ring vertex distance
            ta = min(tas, key=lambda t: min(dist_km(pt, (y, x)) for ring in t['rings'] for x, y in ring[::25]))['name']
        units.append({'code': s['SA22023_V1_00'], 'name': s['SA22023_V1_00_NAME'], 'short': DIRECTION.sub('', s['SA22023_V1_00_NAME']),
                      'pop': int(p), 'lat': s['centre'][0], 'lng': s['centre'][1], 'ta': ta})
    by_ta = defaultdict(list)
    for u in units:
        by_ta[u['ta']].append(u)
    seen, out = set(), []
    for ta, us in sorted(by_ta.items()):
        place = re.sub(r' (District|City)$', '', ta)
        for g in group(us, local_reach=True):
            g.sort(key=lambda m: -m['pop'])
            shorts = []
            for m in g:
                if m['short'] not in shorts:
                    shorts.append(m['short'])
            name = shorts[0] if len(shorts) == 1 else (f'{shorts[0]} and {shorts[1]}' if len(shorts) == 2 else f'{shorts[0]}, {shorts[1]} and {shorts[2]}' if len(shorts) == 3 else f'{shorts[0]} and nearby')
            out.append(area('nz', g, 'sa2-group', ta, 'New Zealand', 'New Zealand', 'Pacific/Auckland', place, seen, name=name))
    return out


NYC_BOROUGH_POP_2020 = {'Bronx': 1472654, 'Brooklyn': 2736074, 'Manhattan': 1694251, 'Queens': 2405464, 'Staten Island': 495747}


def new_york(raw):
    ntas = [n for n in json.load(open(os.path.join(raw, 'nyc-nta.json'), encoding='utf-8')) if n['type'] == '0']
    per = Counter(n['borough'] for n in ntas)
    seen, out = set(), []
    for n in ntas:
        m = {'code': n['code'], 'name': n['name'], 'pop': NYC_BOROUGH_POP_2020[n['borough']] // per[n['borough']], 'lat': n['centre'][0], 'lng': n['centre'][1]}
        out.append(area('us-nyc', [m], 'nta', n['borough'], 'New York', 'United States', 'America/New_York', f"{n['borough']}, New York City", seen, estimated=True))
    return out


DC_POP_2020 = 689545


def washington(raw):
    clusters = [c for c in json.load(open(os.path.join(raw, 'dc-clusters.json'), encoding='utf-8')) if int(c['code'].split()[-1]) <= 39]
    seen, out = set(), []
    for c in clusters:
        names = [x.strip() for x in c['names'].split(',') if x.strip()]
        name = names[0] if len(names) == 1 else (f'{names[0]} and {names[1]}' if len(names) == 2 else f'{names[0]}, {names[1]} and {names[2]}')
        m = {'code': c['code'], 'name': names[0], 'pop': DC_POP_2020 // len(clusters), 'lat': c['centre'][0], 'lng': c['centre'][1]}
        a = area('us-dc', [m], 'cluster', 'Washington, DC', 'District of Columbia', 'United States', 'America/New_York', 'Washington, DC', seen, estimated=True, name=name)
        a['members'] = [{'code': c['code'], 'name': n, 'qualified': f'{n} (Washington, DC)', 'pop': m['pop'] // len(names)} for n in names]
        out.append(a)
    return out


def write(out_dir, key, areas, source):
    per = sorted(a['population'] for a in areas)
    summary = {'source': source, 'editions': len(areas), 'population': sum(per),
               'median_people_per_edition': per[len(per) // 2], 'p10': per[len(per) // 10], 'p90': per[9 * len(per) // 10],
               'below_floor': sum(1 for p in per if p < FLOOR), 'estimated_population': sum(1 for a in areas if a['population_estimated'])}
    with open(os.path.join(out_dir, f'{key}.json'), 'w', encoding='utf-8') as f:
        json.dump({'summary': summary, 'areas': areas}, f, ensure_ascii=False, separators=(',', ':'))
    print(key, json.dumps(summary))


if __name__ == '__main__':
    raw = sys.argv[1]
    out_dir = sys.argv[2] if len(sys.argv) > 2 else 'data/areas'
    write(out_dir, 'ie', ireland(raw), 'CSO Local Electoral Areas 2022 (Tailte Eireann); county populations Census 2022 (CSO F1001)')
    write(out_dir, 'au', australia(raw), 'ABS ASGS 2021 SA2; estimated resident population 2025 (ABS_ANNUAL_ERP_ASGS2021)')
    write(out_dir, 'nz', new_zealand(raw), 'Stats NZ Statistical Area 2 2023; 2023 Census usual resident population')
    write(out_dir, 'us-nyc', new_york(raw), 'NYC Planning 2020 Neighborhood Tabulation Areas (residential); borough populations Census 2020')
    write(out_dir, 'us-dc', washington(raw), 'DC Neighborhood Clusters 1-39 (DC GIS); District population Census 2020')
