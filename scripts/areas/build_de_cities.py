"""
Second pass for Germany: split every city above 60,000 people into editions of
about 25,000 using its districts from Wikidata.

For each city record in data/areas/de.json (kind 'city'):
  1. Fetch the items located in the city, one or two levels down (Stadtbezirk,
     Stadtteil, Ortsteil), with population and coordinates, by the city's
     official municipality key (AGS, Wikidata P439).
  2. Use the finest level (Stadtteil / Ortsteil) when its populations add up
     to 75-110% of the city's; otherwise the coarser level (Stadtbezirk,
     Ortsbezirk); otherwise mark the city `needs_districts` for a hand pass.
  3. Group districts into editions with the same nearest-neighbour rule as the
     villages: a district of 10,000+ stands alone; smaller ones merge with
     their nearest neighbours until a group reaches 20,000, never past 40,000.

Responses are cached, so a rerun does not query Wikidata again.

Usage: python scripts/areas/build_de_cities.py [data/areas/de.json] [cache_dir]
"""
import json, math, os, re, socket, sys, time, unicodedata, urllib.parse, urllib.request

# IPv6 to Wikidata times out on some networks; resolve IPv4 only.
_gai = socket.getaddrinfo
socket.getaddrinfo = lambda host, port, family=0, *a, **k: _gai(host, port, socket.AF_INET, *a, **k)
from collections import Counter

FLOOR, MERGE_STOP, MERGE_CAP, TARGET = 10_000, 20_000, 40_000, 25_000
UA = 'FlaneurAreaBuilder/1.0 (+https://readflaneur.com)'
FINE = re.compile(r'^(Stadtteil|Ortsteil|Stadtbezirksteil)\b', re.I)
# Sub-quarters, used only when a city has too few proper Stadtteile.
QUARTER = re.compile(r'^(Siedlungsteil|Wohnviertel|Stadtviertel)\b', re.I)
COARSE = re.compile(r'^(Stadtbezirk|Ortsbezirk|Bezirk|Stadtbereich)\b', re.I)
# Inside a city, districts merge only with neighbours this close.
MAX_MERGE_KM = 4.5


def slug(s):
    s = unicodedata.normalize('NFKD', s.replace('ß', 'ss')).encode('ascii', 'ignore').decode()
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


def ags_of(ars):
    return ars[0:2] + ars[2] + ars[3:5] + ars[9:12]


def sparql(query, cache_path):
    if os.path.exists(cache_path):
        return json.load(open(cache_path, encoding='utf-8'))
    url = 'https://query.wikidata.org/sparql?' + urllib.parse.urlencode({'query': query})
    for attempt in range(5):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/sparql-results+json'})
            with urllib.request.urlopen(req, timeout=90) as r:
                data = json.load(r)
            json.dump(data, open(cache_path, 'w', encoding='utf-8'))
            time.sleep(1.0)
            return data
        except Exception as e:
            time.sleep(5 * (attempt + 1))
            last = e
    raise RuntimeError(f'wikidata failed: {last}')


def districts_for(ags, cache_dir):
    q = f'''SELECT ?d ?dLabel ?pop ?coord ?typeLabel ?parent WHERE {{
  ?city wdt:P439 "{ags}" .
  ?d wdt:P131 ?parent . ?parent wdt:P131* ?city .
  ?d wdt:P625 ?coord ; wdt:P31 ?type .
  OPTIONAL {{ ?d wdt:P1082 ?pop . }}
  SERVICE wikibase:label {{ bd:serviceParam wikibase:language "de,en". }}
}}'''
    data = sparql(q, os.path.join(cache_dir, f'wd2-{ags}.json'))
    items = {}
    for b in data['results']['bindings']:
        qid = b['d']['value'].rsplit('/', 1)[-1]
        m = re.match(r'Point\(([-\d.]+) ([-\d.]+)\)', b['coord']['value'])
        if not m:
            continue
        it = items.setdefault(qid, {'qid': qid, 'name': b['dLabel']['value'], 'pop': 0, 'lng': float(m.group(1)),
                                    'lat': float(m.group(2)), 'types': set(), 'pop_estimated': True})
        if 'pop' in b:
            it['pop'] = max(it['pop'], int(float(b['pop']['value'])))
            it['pop_estimated'] = False
        it['types'].add(b['typeLabel']['value'])
        it.setdefault('parents', set()).add(b['parent']['value'].rsplit('/', 1)[-1])
    return list(items.values())


def leaves(level):
    """Resolve units listed inside other units of the same level. A container
    is dropped in favour of its parts only when the parts carry most of its
    population (Berlin's Bezirke and their Ortsteile); otherwise the parts are
    dropped (Prenzlauer Berg and a few Kieze listed inside it)."""
    by_id = {i['qid']: i for i in level}
    children = {}
    for i in level:
        for p in i.get('parents', ()):
            if p in by_id and p != i['qid']:
                children.setdefault(p, []).append(i)
    drop = set()
    for cid, kids in children.items():
        container = by_id[cid]
        known_kids = sum(k['pop'] for k in kids if not k['pop_estimated'])
        if container['pop_estimated'] or (container['pop'] and known_kids >= 0.7 * container['pop']):
            drop.add(cid)
        else:
            drop.update(k['qid'] for k in kids)
    return [i for i in level if i['qid'] not in drop]


def choose_level(items, city_pop, split_into, city_name=''):
    """The finest level with enough named districts to make the editions. Where a
    district has no population, the city's uncounted residents are shared
    evenly among those districts and the figure is marked as an estimate."""
    def usable(i):
        # not an unlabelled item, not the city itself under another name
        return (not re.match(r'^Q\d+$', i['name']) and i['pop'] <= city_pop * 0.5
                and not re.search(r'kreisfreie stadt|^stadt ', i['name'], re.I) and i['name'] != city_name)
    items = [i for i in items if usable(i)]
    fine = [i for i in items if any(FINE.search(t) for t in i['types'])]
    quarter = [i for i in items if any(QUARTER.search(t) for t in i['types']) and i not in fine]
    coarse = [i for i in items if any(COARSE.search(t) for t in i['types']) and i not in fine and i not in quarter]
    for level, name in ((leaves(fine), 'fine'), (leaves(fine + quarter), 'fine+quarters'), (leaves(coarse), 'coarse')):
        # Fewer, larger districts are fine (no ceiling); at least half as many as editions.
        if len(level) < max(2, math.ceil(split_into / 2)):
            continue
        known = sum(i['pop'] for i in level if not i['pop_estimated'])
        if known > city_pop * 1.10:
            # overlapping units or stale figures: scale to the city's own total
            for i in level:
                if not i['pop_estimated']:
                    i['pop'] = int(i['pop'] * city_pop / known)
                    i['pop_estimated'] = True
            known = city_pop
        unknown = [i for i in level if i['pop_estimated']]
        if unknown:
            share = max(0, city_pop - known) // len(unknown)
            for i in unknown:
                i['pop'] = share
        cov = round(known / city_pop, 3) if city_pop else 0
        return level, name, cov
    return None, 'none', 0


def group(units):
    pool = sorted(units, key=lambda u: -u['pop'])
    groups = []
    while pool:
        seed = pool.pop(0)
        grp = [seed]
        while pop_of(grp) < MERGE_STOP and pool:
            c = centroid(grp)
            pool.sort(key=lambda u: dist_km(c, (u['lat'], u['lng'])))
            # the nearest district small enough to join, within reach; a district
            # that can stand on its own is never folded into another
            nxt = next((u for u in pool if u['pop'] < FLOOR and pop_of(grp) + u['pop'] <= MERGE_CAP
                        and dist_km(c, (u['lat'], u['lng'])) <= MAX_MERGE_KM), None)
            if not nxt:
                break
            pool.remove(nxt)
            grp.append(nxt)
        groups.append(grp)
    # A leftover under the floor joins its nearest group if one is within reach;
    # otherwise it stays a small edition of its own.
    while True:
        moved = False
        for g in sorted((g for g in groups if pop_of(g) < FLOOR), key=pop_of):
            c = centroid(g)
            near = [o for o in groups if o is not g and dist_km(c, centroid(o)) <= MAX_MERGE_KM]
            if near:
                o = min(near, key=lambda o: dist_km(c, centroid(o)))
                o.extend(g)
                groups.remove(g)
                moved = True
                break
        if not moved:
            break
    return groups


def group_name(ms):
    names = [m['name'] for m in sorted(ms, key=lambda m: -m['pop'])]
    if len(names) == 1:
        return names[0]
    if len(names) == 2:
        return f'{names[0]} und {names[1]}'
    if len(names) == 3:
        return f'{names[0]}, {names[1]} und {names[2]}'
    return f'{names[0]} und Umgebung'


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else 'data/areas/de.json'
    cache_dir = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.environ.get('TEMP', '/tmp'), 'areas', 'wd')
    os.makedirs(cache_dir, exist_ok=True)
    d = json.load(open(path, encoding='utf-8'))
    out, report = [], []
    seen = {a['id'] for a in d['areas'] if a['kind'] != 'city'}
    for a in d['areas']:
        if a['kind'] != 'city':
            if a['population'] > 0:
                out.append(a)
            continue
        city = a['members'][0]
        try:
            items = districts_for(ags_of(city['ars']), cache_dir)
        except Exception as e:
            a['needs_districts'] = True
            out.append(a)
            report.append({'city': a['name'], 'pop': a['population'], 'status': 'fetch_failed', 'error': str(e)[:120]})
            continue
        level, lname, cov = choose_level(items, a['population'], a['split_into'], a['name'])
        if not level:
            a['needs_districts'] = True
            out.append(a)
            report.append({'city': a['name'], 'pop': a['population'], 'status': 'needs_districts', 'level': lname, 'coverage': cov, 'items': len(items)})
            continue
        for g in group(level):
            g.sort(key=lambda m: -m['pop'])
            base = f"de-{slug(a['name'])}-{slug(g[0]['name'])}"
            aid, i = base, 2
            while aid in seen:
                aid, i = f'{base}-{i}', i + 1
            seen.add(aid)
            c = centroid(g)
            out.append({
                'id': aid, 'kind': 'city-district', 'name': group_name(g), 'city': a['name'], 'kreis': a['kreis'],
                'land': a['land'], 'country': 'Germany', 'population': pop_of(g),
                'lat': round(c[0], 5), 'lng': round(c[1], 5),
                # a single district far above the target (Berlin-Neukolln) needs its own sub-split later
                'split_into': max(1, round(pop_of(g) / TARGET)) if pop_of(g) > 60_000 else 1,
                'needs_subdistricts': pop_of(g) > 60_000, 'namesake': False,
                'population_estimated': any(m['pop_estimated'] for m in g),
                'members': [{'wikidata': m['qid'], 'name': m['name'], 'qualified': f"{m['name']} ({a['name']})",
                             'pop': m['pop'], 'pop_estimated': m['pop_estimated'], 'lat': m['lat'], 'lng': m['lng']} for m in g],
            })
        report.append({'city': a['name'], 'pop': a['population'], 'status': 'split', 'level': lname, 'known_pop_share': cov, 'districts': len(level),
                       'editions': sum(1 for x in out if x.get('city') == a['name'])})

    per = sorted(x['population'] / x['split_into'] for x in out)
    s = d['summary']
    s.update({
        'records': len(out),
        'editions': sum(x['split_into'] for x in out),
        'by_kind': dict(Counter(x['kind'] for x in out)),
        'cities_split': sum(1 for r in report if r['status'] == 'split'),
        'cities_needing_districts': [r['city'] for r in report if r['status'] != 'split'],
        'median_people_per_edition': round(per[len(per) // 2]),
        'p10': round(per[len(per) // 10]),
        'p90': round(per[9 * len(per) // 10]),
        'below_floor': sum(1 for x in out if x['population'] < FLOOR),
        'district_source': 'Wikidata (P131 within the city, P1082 population, P625 coordinates)',
    })
    s.pop('editions_in_cities', None)
    d['areas'] = out
    d['city_report'] = report
    json.dump(d, open(path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(json.dumps(s, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()
