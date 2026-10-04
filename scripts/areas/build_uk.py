"""
Cut the United Kingdom into editions of about 25,000 people from census
small areas. England and Wales first (MSOAs, ~8,000 people each, with the
House of Commons Library's readable names); Scotland and Northern Ireland
follow with their own units.

Rules (the catchment rule in CLAUDE.md, as for Germany): neighbouring MSOAs
are grouped inside the same local authority until a group reaches 20,000,
never past 40,000, and only with neighbours within reach (a distance scaled to
how densely the authority is packed: tight in Birmingham, wide in Cornwall).
A group never crosses a council boundary. Every member carries its local
authority as a qualifier for search.

Inputs (England and Wales):
  msoa-names.csv  House of Commons Library MSOA Names 2.2
                  (houseofcommonslibrary.github.io/msoanames)
  msoa-pop.csv    Census 2021 usual residents by MSOA (Nomis NM_2021_1)
  msoa-pwc.json   ONS MSOA December 2021 population-weighted centroids
Inputs (Scotland and Northern Ireland):
  wards-sni.json  ONS Wards December 2024 (BGC), Scottish and NI wards with LAT/LONG
  lad-pop.csv     ONS mid-year population by local authority (Nomis NM_2002_1)
  Wards in both nations are drawn to similar electorates within a council, so
  each ward takes an equal share of its council's population, marked as an
  estimate (population_estimated).

Usage: python scripts/areas/build_uk.py <input_dir> [out.json]
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


def load_ew(d):
    names = {}
    with open(os.path.join(d, 'msoa-names.csv'), encoding='utf-8-sig') as f:
        for r in csv.DictReader(f):
            names[r['msoa21cd']] = r
    pop = {}
    with open(os.path.join(d, 'msoa-pop.csv'), encoding='utf-8') as f:
        for r in csv.DictReader(f):
            pop[r['GEOGRAPHY_CODE']] = int(r['OBS_VALUE'])
    pwc = {c: (lat, lng) for c, lat, lng in json.load(open(os.path.join(d, 'msoa-pwc.json')))}
    out = []
    for code, r in names.items():
        if code not in pop or code not in pwc:
            continue
        out.append({'code': code, 'name': r['msoa21hclnm'] or r['msoa21nm'], 'la': r['localauthorityname'],
                    'nation': 'Wales' if code.startswith('W') else 'England', 'pop': pop[code],
                    'lat': pwc[code][0], 'lng': pwc[code][1]})
    return out


def load_sni(d):
    wards_path = os.path.join(d, 'wards-sni.json')
    if not os.path.exists(wards_path):
        return []
    lad_pop = {}
    with open(os.path.join(d, 'lad-pop.csv'), encoding='utf-8') as f:
        for r in csv.DictReader(f):
            lad_pop[r['GEOGRAPHY_CODE']] = int(r['OBS_VALUE'])
    wards = json.load(open(wards_path, encoding='utf-8'))
    per_lad = Counter(w['LAD24CD'] for w in wards)
    out = []
    for w in wards:
        total = lad_pop.get(w['LAD24CD'])
        if not total:
            continue
        out.append({'code': w['WD24CD'], 'name': w['WD24NM'].strip(), 'la': w['LAD24NM'],
                    'nation': 'Scotland' if w['WD24CD'].startswith('S') else 'Northern Ireland',
                    'pop': total // per_lad[w['LAD24CD']], 'lat': w['LAT'], 'lng': w['LONG'], 'estimated': True})
    return out


def group_authority(units):
    """Nearest-neighbour grouping inside one local authority, within a reach
    scaled to its density (three times the median nearest-neighbour spacing)."""
    if len(units) == 1:
        return [units]
    spacing = []
    for u in units:
        spacing.append(min(dist_km((u['lat'], u['lng']), (v['lat'], v['lng'])) for v in units if v is not u))
    reach = max(2.5, 3 * statistics.median(spacing))
    pool = sorted(units, key=lambda u: -u['pop'])
    groups = []
    while pool:
        grp = [pool.pop(0)]
        while pop_of(grp) < MERGE_STOP and pool:
            c = centroid(grp)
            pool.sort(key=lambda u: dist_km(c, (u['lat'], u['lng'])))
            nxt = next((u for u in pool if pop_of(grp) + u['pop'] <= MERGE_CAP and dist_km(c, (u['lat'], u['lng'])) <= reach), None)
            if not nxt:
                break
            pool.remove(nxt)
            grp.append(nxt)
        groups.append(grp)
    # A group left under the floor joins its nearest group within reach.
    while True:
        moved = False
        for g in sorted((g for g in groups if pop_of(g) < FLOOR), key=pop_of):
            c = centroid(g)
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


def build(d):
    units = load_ew(d) + load_sni(d)
    by_la = defaultdict(list)
    for u in units:
        by_la[u['la']].append(u)
    areas, seen = [], set()
    for la, us in sorted(by_la.items()):
        for g in group_authority(us):
            g.sort(key=lambda m: -m['pop'])
            base = f"uk-{slug(la)}-{slug(g[0]['name'])}"
            aid, i = base, 2
            while aid in seen:
                aid, i = f'{base}-{i}', i + 1
            seen.add(aid)
            c = centroid(g)
            areas.append({
                'id': aid, 'kind': 'msoa-group', 'name': group_name(g), 'kreis': la, 'land': g[0]['nation'],
                'country': 'United Kingdom', 'population': pop_of(g), 'lat': round(c[0], 5), 'lng': round(c[1], 5),
                'split_into': 1,
                'population_estimated': any(m.get('estimated') for m in g),
                'members': [{'code': m['code'], 'name': m['name'], 'qualified': f"{m['name']} ({la})", 'pop': m['pop']} for m in g],
            })
    return areas, units


if __name__ == '__main__':
    src = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else 'data/areas/uk.json'
    areas, units = build(src)
    per = sorted(a['population'] for a in areas)
    summary = {
        'source': 'Census 2021 (ONS, Nomis NM_2021_1), House of Commons Library MSOA Names 2.2, ONS MSOA 2021 population-weighted centroids',
        'coverage': 'United Kingdom: England and Wales from census MSOAs; Scotland and Northern Ireland from council wards with estimated populations',
        'msoas': len(units), 'population': sum(u['pop'] for u in units),
        'editions': len(areas), 'by_nation': dict(Counter(a['land'] for a in areas)),
        'median_people_per_edition': per[len(per) // 2], 'p10': per[len(per) // 10], 'p90': per[9 * len(per) // 10],
        'below_floor': sum(1 for p in per if p < FLOOR),
    }
    with open(out, 'w', encoding='utf-8') as f:
        json.dump({'summary': summary, 'areas': areas}, f, ensure_ascii=False, separators=(',', ':'))
    print(json.dumps(summary, indent=1))
