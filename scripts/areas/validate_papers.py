"""
Check edition areas against newspaper towns: a town that had its own paper was
a news market, so an edition should hold one such town (with its villages and
suburbs), and a mid-size paper town should not be cut across editions.

UK and Ireland: the British Library's title list of British and Irish
newspapers (CC0, bl.iro.bl.uk, 2019), matched by town name to the editions'
member names. A paper town is "strong" when it had three or more titles or one
that ran fifteen years or more.

  anchored  the edition contains a paper town
  glued     the edition contains two or more strong paper towns (two news
            markets in one edition: review)
  split     a strong paper town appears in two or more editions of the same
            council and is not the council's own name (expected for cities,
            a warning for a mid-size town: review)

Usage: python scripts/areas/validate_papers.py <bl-titles.csv> <areas.json> [country ...]
"""
import csv, json, re, sys
from collections import defaultdict


def load_papers(path, countries):
    papers = defaultdict(list)
    with open(path, encoding='cp1252', errors='replace') as f:
        for r in csv.DictReader(f):
            if r['country_of_publication'] not in countries:
                continue
            town = (r['coverage_city'] or r['place_of_publication'] or '').split('|')[0].strip()
            if len(town) < 3:
                continue
            try:
                a = int((r['first_date_held'] or r['publication_date_one'] or '0')[:4])
                b = int((r['last_date_held'] or r['publication_date_two'] or '0')[:4])
            except ValueError:
                a = b = 0
            papers[town].append((a, b))
    return papers


def main():
    titles, areas_path = sys.argv[1], sys.argv[2]
    countries = set(sys.argv[3:]) or {'England', 'Wales', 'Scotland', 'Northern Ireland'}
    towns = load_papers(titles, countries)
    areas = json.load(open(areas_path, encoding='utf-8'))['areas']
    pattern = {t: re.compile(r'(?<![A-Za-z])' + re.escape(t) + r'(?![A-Za-z])', re.I) for t in towns}

    def strong(t):
        v = towns[t]
        return len(v) >= 3 or any(b - a >= 15 for a, b in v)

    ed_towns, town_eds = defaultdict(set), defaultdict(list)
    for a in areas:
        text = ' | '.join([a['name']] + [m['name'] for m in a['members']])
        for t, p in pattern.items():
            if p.search(text):
                ed_towns[a['id']].add(t)
                town_eds[t].append(a)

    anchored = sum(1 for a in areas if ed_towns[a['id']])
    glued = []
    for a in areas:
        ts = [t for t in ed_towns[a['id']] if strong(t)]
        ts = [t for t in ts if not any(t != u and t.lower() in u.lower() for u in ts)]
        if len(ts) >= 2:
            glued.append({'id': a['id'], 'name': a['name'], 'council': a['kreis'], 'population': a['population'], 'towns': sorted(ts)})
    split = []
    for t, eds in town_eds.items():
        if not strong(t):
            continue
        by = defaultdict(list)
        for a in eds:
            by[a['kreis']].append(a)
        for council, group in by.items():
            if len(group) >= 2 and t.lower() not in council.lower():
                split.append({'town': t, 'council': council, 'editions': [g['id'] for g in group], 'population': sum(g['population'] for g in group)})

    report = {
        'paper_towns': len(towns), 'titles': sum(len(v) for v in towns.values()),
        'editions': len(areas), 'anchored': anchored, 'anchored_share': round(anchored / len(areas), 3),
        'glued': len(glued), 'split': len(split),
    }
    print(json.dumps(report, indent=1))
    print('\nGLUED (two news markets in one edition), largest first:')
    for g in sorted(glued, key=lambda g: -len(g['towns']))[:15]:
        print(f"  {g['id']:<52} {g['population']:>7,}  {', '.join(g['towns'])}")
    print('\nSPLIT (a paper town cut across editions of one council), smallest first:')
    for s in sorted(split, key=lambda s: s['population'])[:15]:
        print(f"  {s['town']:<22} {s['council']:<28} {len(s['editions'])} editions, {s['population']:,} people")
    json.dump({'report': report, 'glued': glued, 'split': split}, open(areas_path.replace('.json', '.papers-check.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
