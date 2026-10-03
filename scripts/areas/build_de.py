"""
Cut Germany into editions of about 25,000 people from the Destatis
municipality register (Gemeindeverzeichnis, "Alle politisch selbstaendigen
Gemeinden mit ausgewaehlten Merkmalen", quarterly xlsx).

Rules (the catchment rule in CLAUDE.md: 10,000 soft floor, 25,000 target, no
ceiling, never absorb a larger neighbouring town):
  1. A Gemeinde of 10,000 to SPLIT_ABOVE people is one edition.
  2. A Gemeinde above SPLIT_ABOVE is a city to split into parts of about
     25,000; its districts come from a second pass (the register stops at the
     municipality), so here it is one record with `split_into`.
  3. Gemeinden under 10,000 are grouped first by their Gemeindeverband
     (Amt, Verbandsgemeinde, Samtgemeinde, Verwaltungsgemeinschaft), then
     merged with their nearest small neighbours inside the same Kreis until a
     group reaches the target. A small group never absorbs a town of 10,000+.
  4. Every member carries its Kreis as a qualifier for search, because German
     place names repeat (there are many Neustadts and Oberkassels).

Usage: python scripts/areas/build_de.py <register.xlsx> [out.json]
"""
import json, math, re, sys, unicodedata
from collections import defaultdict, Counter
import openpyxl

FLOOR = 10_000
TARGET = 25_000
MERGE_STOP = 20_000      # a growing group stops once it reaches this
MERGE_CAP = 40_000       # and never grows past this by merging
SPLIT_ABOVE = 60_000

LAND = {'01': 'Schleswig-Holstein', '02': 'Hamburg', '03': 'Niedersachsen', '04': 'Bremen', '05': 'Nordrhein-Westfalen',
        '06': 'Hessen', '07': 'Rheinland-Pfalz', '08': 'Baden-Württemberg', '09': 'Bayern', '10': 'Saarland', '11': 'Berlin',
        '12': 'Brandenburg', '13': 'Mecklenburg-Vorpommern', '14': 'Sachsen', '15': 'Sachsen-Anhalt', '16': 'Thüringen'}

VERBAND_PREFIX = re.compile(r'^(Amt|Verbandsgemeinde|Samtgemeinde|Verwaltungsgemeinschaft|VG|Gemeindeverwaltungsverband|GVV|Verwaltungsverband|Vereinbarte Verwaltungsgemeinschaft)\s+')


def clean_name(n):
    return n.split(',')[0].strip() if n else n


def verband_name(n):
    return VERBAND_PREFIX.sub('', clean_name(n) or '')


def slug(s):
    s = unicodedata.normalize('NFKD', s.replace('ß', 'ss')).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')


def num(x):
    if x is None or x == '':
        return None
    return float(str(x).replace(',', '.'))


def dist_km(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


def pop_of(members):
    return sum(m['pop'] for m in members)


def centroid(members):
    p = pop_of(members) or 1
    return (sum(m['lat'] * m['pop'] for m in members) / p, sum(m['lng'] * m['pop'] for m in members) / p)


def read_register(path):
    wb = openpyxl.load_workbook(path, read_only=True)
    ws = wb[[s for s in wb.sheetnames if s.startswith('Onlineprodukt')][0]]
    kreise, verbaende, gemeinden = {}, {}, []
    for row in ws.iter_rows(values_only=True):
        sat = str(row[0] or '').strip()
        if sat == '40':
            kreise[(row[2], row[3], row[4])] = clean_name(row[7])
        elif sat == '50':
            verbaende[(row[2], row[3], row[4], row[5])] = row[7]
        elif sat == '60' and row[9] is not None:
            lat, lng = num(row[15]), num(row[14])
            if lat is None or lng is None:
                continue
            gemeinden.append({
                'ars': f'{row[2]}{row[3]}{row[4]}{row[5]}{row[6]}',
                'name': clean_name(row[7]),
                'land': LAND.get(row[2], row[2]),
                'kreis_key': (row[2], row[3], row[4]),
                'vb_key': (row[2], row[3], row[4], row[5]),
                'pop': int(row[9]),
                'lat': lat, 'lng': lng,
            })
    return kreise, verbaende, gemeinden


def build(path):
    kreise, verbaende, gem = read_register(path)
    for g in gem:
        g['kreis'] = kreise.get(g['kreis_key'], '')
    name_count = Counter(g['name'] for g in gem)

    def member(g):
        where = g['kreis'] if g['kreis'] and g['kreis'] != g['name'] else g['land']
        return {'ars': g['ars'], 'name': g['name'], 'qualified': f"{g['name']} ({where})",
                'pop': g['pop'], 'lat': g['lat'], 'lng': g['lng']}

    areas = []
    small_by_vb = defaultdict(list)
    for g in gem:
        if g['pop'] >= FLOOR:
            kind = 'city' if g['pop'] > SPLIT_ABOVE else 'town'
            areas.append({'kind': kind, 'name': g['name'], 'kreis': g['kreis'], 'land': g['land'],
                          'members': [member(g)],
                          'split_into': max(2, round(g['pop'] / TARGET)) if kind == 'city' else 1,
                          'namesake': name_count[g['name']] > 1})
        else:
            small_by_vb[g['vb_key']].append(g)

    # Units of small Gemeinden: a real Gemeindeverband groups its members;
    # a verbandsfreie Gemeinde is a unit of one.
    units_by_kreis = defaultdict(list)
    for vb, gs in small_by_vb.items():
        vname = verband_name(verbaende.get(vb, '') or '')
        if len(gs) > 1 and vname:
            units_by_kreis[gs[0]['kreis_key']].append({'label': vname, 'members': [member(g) for g in gs]})
        else:
            for g in gs:
                units_by_kreis[g['kreis_key']].append({'label': g['name'], 'members': [member(g)]})

    # Greedy nearest-neighbour merging inside each Kreis.
    for kk, units in units_by_kreis.items():
        kreis = kreise.get(kk, '')
        land = LAND.get(kk[0], kk[0])
        pool = sorted(units, key=lambda u: -pop_of(u['members']))
        groups = []
        while pool:
            seed = pool.pop(0)
            grp = {'labels': [seed['label']], 'members': list(seed['members'])}
            while pop_of(grp['members']) < MERGE_STOP and pool:
                c = centroid(grp['members'])
                pool.sort(key=lambda u: dist_km(c, centroid(u['members'])))
                nxt = pool[0]
                if pop_of(grp['members']) + pop_of(nxt['members']) > MERGE_CAP:
                    break
                pool.pop(0)
                grp['labels'].append(nxt['label'])
                grp['members'].extend(nxt['members'])
            groups.append(grp)
        # A leftover group under the floor joins the nearest group in the Kreis.
        changed = True
        while changed and len(groups) > 1:
            changed = False
            for g in sorted(groups, key=lambda x: pop_of(x['members'])):
                pop = pop_of(g['members'])
                if pop >= FLOOR:
                    break
                c = centroid(g['members'])
                others = [o for o in groups if o is not g]
                o = min(others, key=lambda o: dist_km(c, centroid(o['members'])))
                o['members'].extend(g['members'])
                o['labels'].extend(g['labels'])
                groups.remove(g)
                changed = True
                break
        for g in groups:
            g['members'].sort(key=lambda m: -m['pop'])
            single = len(g['labels']) == 1
            name = g['labels'][0] if single else f"{g['members'][0]['name']} und Umgebung"
            areas.append({'kind': 'cluster', 'name': name, 'kreis': kreis, 'land': land, 'members': g['members'],
                          'split_into': 1, 'namesake': name_count.get(g['members'][0]['name'], 0) > 1})

    seen = set()
    for a in areas:
        a['population'] = pop_of(a['members'])
        lat, lng = centroid(a['members'])
        a['lat'], a['lng'] = round(lat, 5), round(lng, 5)
        lead = slug(a['members'][0]['name'])
        base = f"de-{slug(a['kreis'])}-{lead}" if (a['kind'] == 'cluster' or a['namesake']) and slug(a['kreis']) != lead else f"de-{lead}"
        aid, i = base, 2
        while aid in seen:
            aid, i = f'{base}-{i}', i + 1
        seen.add(aid)
        a['id'] = aid
        a['country'] = 'Germany'
    return areas, gem


if __name__ == '__main__':
    src = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else 'data/areas/de.json'
    areas, gem = build(src)
    per = sorted(a['population'] / a['split_into'] for a in areas)
    summary = {
        'source': 'Destatis Gemeindeverzeichnis, Gebietsstand 31.03.2026, population 31.12.2024 (Zensus 2022 basis)',
        'gemeinden': len(gem),
        'population': sum(g['pop'] for g in gem),
        'records': len(areas),
        'editions': sum(a['split_into'] for a in areas),
        'by_kind': dict(Counter(a['kind'] for a in areas)),
        'editions_in_cities': sum(a['split_into'] for a in areas if a['kind'] == 'city'),
        'median_people_per_edition': round(per[len(per) // 2]),
        'p10': round(per[len(per) // 10]),
        'p90': round(per[9 * len(per) // 10]),
        'below_floor': sum(1 for a in areas if a['population'] < FLOOR),
    }
    with open(out, 'w', encoding='utf-8') as f:
        json.dump({'summary': summary, 'areas': areas}, f, ensure_ascii=False, indent=1)
    print(json.dumps(summary, ensure_ascii=False, indent=1))
