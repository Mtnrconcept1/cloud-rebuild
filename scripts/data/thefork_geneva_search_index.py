from __future__ import annotations

import csv
import html
import json
import re
import sys
import time
from collections import defaultdict
from pathlib import Path
from urllib.parse import quote_plus, unquote, urlparse

import requests
from bs4 import BeautifulSoup

OUT_DIR = Path("artifacts/thefork-geneva-search-index")
BASE_SEARCH_URL = "https://search.brave.com/search"
USER_AGENT = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"
THEFORK_RE = re.compile(r"https?://(?:www\.)?thefork\.ch/restaurant/([^/?#\s]+-r(\d+))(?:[/#?][^\s\"<>]*)?", re.I)

GENEVA_MUNICIPALITIES = [
    "Genève", "Carouge", "Meyrin", "Vernier", "Lancy", "Grand-Lancy", "Petit-Lancy",
    "Onex", "Thônex", "Veyrier", "Versoix", "Plan-les-Ouates", "Le Grand-Saconnex",
    "Grand-Saconnex", "Chêne-Bourg", "Chêne-Bougeries", "Cologny", "Collonge-Bellerive",
    "Pregny-Chambésy", "Bellevue", "Genthod", "Céligny", "Collex-Bossy", "Satigny",
    "Russin", "Dardagny", "Bernex", "Confignon", "Perly-Certoux", "Bardonnex", "Troinex",
    "Anières", "Corsier", "Hermance", "Meinier", "Jussy", "Presinge", "Puplinge",
    "Vandœuvres", "Gy", "Soral", "Avusy", "Laconnex", "Cartigny", "Aire-la-Ville", "Avully",
]

GENEVA_POSTCODES = [
    *range(1201, 1210), 1211, 1212, 1213, 1214, 1215, 1216, 1217, 1218, 1219,
    1220, 1222, 1223, 1224, 1225, 1226, 1227, 1228,
    1231, 1232, 1233, 1234, 1236, 1237, 1239,
    1241, 1242, 1243, 1244, 1245, 1246, 1247, 1248,
    1251, 1252, 1253, 1254, 1255, 1256, 1257, 1258,
    1281, 1283, 1284, 1285, 1286, 1287, 1288,
    1290, 1291, 1292, 1293, 1294,
]


def canonicalize(raw_url: str) -> tuple[str, str, str] | None:
    decoded = html.unescape(unquote(raw_url.replace("\\/", "/")))
    match = THEFORK_RE.search(decoded)
    if not match:
        return None
    slug_id = match.group(1).lower()
    rid = match.group(2)
    return f"https://www.thefork.ch/restaurant/{slug_id}", rid, slug_id


def infer_name(slug_id: str) -> str:
    slug = re.sub(r"-r\d+$", "", slug_id)
    return " ".join(token.capitalize() for token in slug.split("-") if token)


def extract_hits(content: str) -> list[dict[str, str]]:
    soup = BeautifulSoup(content, "html.parser")
    hits: list[dict[str, str]] = []
    for anchor in soup.find_all("a", href=True):
        parsed = canonicalize(str(anchor.get("href", "")))
        if not parsed:
            continue
        canonical_url, rid, slug_id = parsed
        text = " ".join(anchor.get_text(" ", strip=True).split())
        parent_text = ""
        parent = anchor.find_parent(["div", "article", "li"])
        if parent is not None:
            parent_text = " ".join(parent.get_text(" ", strip=True).split())[:1500]
        hits.append({
            "url": canonical_url,
            "restaurant_id": rid,
            "slug_id": slug_id,
            "anchor_text": text[:1000],
            "context_text": parent_text,
        })
    return hits


def fetch_search(session: requests.Session, query: str, offset: int) -> tuple[int, str]:
    url = f"{BASE_SEARCH_URL}?q={quote_plus(query)}&offset={offset}&spellcheck=0"
    response = session.get(url, timeout=45, allow_redirects=True)
    return response.status_code, response.text


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    raw_dir = OUT_DIR / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)

    query_specs: list[tuple[str, int]] = [
        ('site:thefork.ch/restaurant/ "Genève" "TheFork"', 35),
        ('site:thefork.ch/restaurant/ "à Genève" "TheFork"', 35),
        ('site:thefork.ch/restaurant/ "Restaurants à Genève"', 35),
        ('site:thefork.ch/restaurant/ "geneve"', 35),
        ('site:thefork.ch/restaurant/ "canton de Genève"', 15),
    ]
    query_specs.extend((f'site:thefork.ch/restaurant/ "{municipality}" "TheFork"', 6) for municipality in GENEVA_MUNICIPALITIES)
    query_specs.extend((f'site:thefork.ch/restaurant/ "{postcode}" "TheFork"', 3) for postcode in GENEVA_POSTCODES)

    session = requests.Session()
    session.headers.update({
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "fr-CH,fr;q=0.9,en;q=0.7",
    })

    records: dict[str, dict[str, object]] = {}
    query_stats: list[dict[str, object]] = []
    failures: list[dict[str, object]] = []

    for query_index, (query, max_offsets) in enumerate(query_specs):
        stale_offsets = 0
        query_unique_before = len(records)
        for offset in range(max_offsets):
            try:
                status, content = fetch_search(session, query, offset)
            except Exception as exc:  # noqa: BLE001
                failures.append({"query": query, "offset": offset, "error": repr(exc)})
                break

            raw_path = raw_dir / f"q{query_index:03d}-o{offset:02d}.html"
            raw_path.write_text(content, encoding="utf-8", errors="replace")
            hits = extract_hits(content)
            new_this_offset = 0
            for hit in hits:
                rid = hit["restaurant_id"]
                record = records.get(rid)
                if record is None:
                    record = {
                        "restaurant_id": rid,
                        "restaurant_name_inferred": infer_name(hit["slug_id"]),
                        "slug_id": hit["slug_id"],
                        "url_thefork": hit["url"],
                        "anchor_text_samples": [],
                        "context_text_samples": [],
                        "queries": [],
                        "offsets": [],
                    }
                    records[rid] = record
                    new_this_offset += 1
                for key, sample_key in (("anchor_text", "anchor_text_samples"), ("context_text", "context_text_samples")):
                    value = hit[key]
                    samples = record[sample_key]
                    if value and value not in samples and len(samples) < 8:
                        samples.append(value)
                if query not in record["queries"]:
                    record["queries"].append(query)
                marker = f"q{query_index}:o{offset}"
                if marker not in record["offsets"]:
                    record["offsets"].append(marker)

            query_stats.append({
                "query": query,
                "offset": offset,
                "status": status,
                "hits": len(hits),
                "new_unique": new_this_offset,
                "total_unique": len(records),
                "response_length": len(content),
            })
            print(json.dumps(query_stats[-1], ensure_ascii=False))

            if status != 200:
                break
            if not hits or new_this_offset == 0:
                stale_offsets += 1
            else:
                stale_offsets = 0
            if stale_offsets >= 3:
                break
            time.sleep(0.35)

        print(json.dumps({
            "query_complete": query,
            "unique_added": len(records) - query_unique_before,
            "total_unique": len(records),
        }, ensure_ascii=False))

    rows = sorted(records.values(), key=lambda row: (str(row["restaurant_name_inferred"]), int(str(row["restaurant_id"]))))
    json_path = OUT_DIR / "thefork_geneva_search_hits.json"
    json_path.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")

    csv_path = OUT_DIR / "thefork_geneva_search_hits.csv"
    with csv_path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=[
            "restaurant_id", "restaurant_name_inferred", "slug_id", "url_thefork",
            "anchor_text_samples", "context_text_samples", "queries", "offsets",
        ], delimiter=";")
        writer.writeheader()
        for row in rows:
            writer.writerow({
                **row,
                "anchor_text_samples": json.dumps(row["anchor_text_samples"], ensure_ascii=False),
                "context_text_samples": json.dumps(row["context_text_samples"], ensure_ascii=False),
                "queries": json.dumps(row["queries"], ensure_ascii=False),
                "offsets": json.dumps(row["offsets"], ensure_ascii=False),
            })

    (OUT_DIR / "query_stats.json").write_text(json.dumps(query_stats, ensure_ascii=False, indent=2), encoding="utf-8")
    (OUT_DIR / "failures.json").write_text(json.dumps(failures, ensure_ascii=False, indent=2), encoding="utf-8")
    (OUT_DIR / "summary.json").write_text(json.dumps({
        "unique_restaurants": len(rows),
        "queries": len(query_specs),
        "requests": len(query_stats),
        "failures": len(failures),
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"complete": True, "unique_restaurants": len(rows)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
