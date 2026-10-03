# Edition areas

One file per country: every area of roughly 25,000 people, built from official
statistics and open data, for the background archive tier. Nothing here
publishes; no edition runs from these files yet.

Catchment rule (CLAUDE.md): 10,000 people is a soft floor, about 25,000 the
target, no ceiling; small places are grouped, a group never absorbs a larger
town, and every place name carries a qualifier for search.

## Germany (`de.json`)

- 3,958 editions in 3,873 areas from 10,940 Gemeinden (83.6m people).
  Median 20,600 people per edition; 80% between 11,200 and 32,400.
- Towns of 10,000 to 60,000: one edition each (1,448).
- Villages: grouped by Gemeindeverband, then with their nearest small
  neighbours inside the same Kreis (903 clusters).
- 149 of 150 cities above 60,000: split by their Stadtteile / Ortsteile from
  Wikidata, merged with neighbours within 4.5 km. Where Wikidata has no
  population for a district, the city's uncounted residents are shared evenly
  and the area says `population_estimated`. Districts above 60,000 (Berlin's
  Neukolln, Prenzlauer Berg, Kreuzberg) carry `needs_subdistricts` and a
  `split_into` for a later pass. Hanau has no district data and is one record
  with `needs_districts`.
- 84 areas stay under 10,000, each the only small place left in a Kreis of
  larger towns, or a city district with no neighbour within reach.

Rebuild (Python 3 with openpyxl):

```
python scripts/areas/build_de.py <Destatis AuszugGV xlsx> data/areas/de.json
python scripts/areas/build_de_cities.py data/areas/de.json
```

then drop member coordinates to keep the file small (areas keep theirs).
Source register: destatis.de, Gemeindeverzeichnis, "Alle politisch
selbstaendigen Gemeinden mit ausgewaehlten Merkmalen" (quarterly).
