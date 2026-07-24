from __future__ import annotations

import json
from pathlib import Path

GENEVA_MUNICIPALITIES = [
    "Genève", "Carouge", "Meyrin", "Vernier", "Lancy", "Grand-Lancy", "Petit-Lancy",
    "Onex", "Thônex", "Veyrier", "Versoix", "Plan-les-Ouates", "Le Grand-Saconnex",
    "Grand-Saconnex", "Chêne-Bourg", "Chêne-Bougeries", "Cologny", "Collonge-Bellerive",
    "Pregny-Chambésy", "Bellevue", "Genthod", "Céligny", "Collex-Bossy", "Satigny",
    "Russin", "Dardagny", "Bernex", "Confignon", "Perly-Certoux", "Bardonnex", "Troinex",
    "Anières", "Corsier", "Hermance", "Meinier", "Jussy", "Presinge", "Puplinge",
    "Vandœuvres", "Gy", "Soral", "Avusy", "Laconnex", "Cartigny", "Aire-la-Ville", "Avully",
]
NEARBY_MUNICIPALITIES = [
    "Ferney-Voltaire", "Annemasse", "Gaillard", "Ambilly", "Ville-la-Grand",
    "Saint-Julien-en-Genevois", "Archamps", "Collonges-sous-Salève", "Étrembières",
    "Bossey", "Neydens", "Prévessin-Moëns", "Saint-Genis-Pouilly", "Divonne-les-Bains",
]
POSTCODES = [
    *range(1201, 1210), 1212, 1213, 1214, 1215, 1216, 1217, 1218, 1219,
    1220, 1222, 1223, 1224, 1225, 1226, 1227, 1228, 1231, 1232, 1233,
]


def main() -> None:
    entries: list[dict[str, object]] = []

    broad = [
        'site:thefork.ch/restaurant/ "Genève" "TheFork"',
        'site:thefork.ch/restaurant/ "à Genève" "TheFork"',
        'site:thefork.ch/restaurant/ "restaurants à Genève"',
        'site:thefork.ch/restaurant/ geneve-c186655',
    ]
    for query in broad:
        for offset in range(25):
            entries.append({"query": query, "offset": offset})

    for municipality in GENEVA_MUNICIPALITIES:
        for offset in range(2):
            entries.append({
                "query": f'site:thefork.ch/restaurant/ "{municipality}" "TheFork"',
                "offset": offset,
            })

    for municipality in NEARBY_MUNICIPALITIES:
        for offset in range(2):
            entries.append({
                "query": f'site:thefork.ch/restaurant/ "{municipality}" "TheFork"',
                "offset": offset,
            })

    for postcode in POSTCODES:
        entries.append({
            "query": f'site:thefork.ch/restaurant/ "{postcode}" "TheFork"',
            "offset": 0,
        })

    entries = entries[:256]
    for index, entry in enumerate(entries):
        entry["id"] = f"{index:03d}"

    output = {"include": entries}
    path = Path("matrix.json")
    path.write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(json.dumps({"matrix_entries": len(entries)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
