from __future__ import annotations

import html
import json
import os
import random
import re
import time
from pathlib import Path
from urllib.parse import quote_plus, unquote

import requests
from bs4 import BeautifulSoup

THEFORK_RE = re.compile(r"https?://(?:www\.)?thefork\.ch/restaurant/([^/?#\s]+-r(\d+))(?:[/#?][^\s\"<>]*)?", re.I)
USER_AGENT = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"


def canonicalize(raw_url: str) -> tuple[str, str, str] | None:
    decoded = html.unescape(unquote(raw_url.replace("\\/", "/")))
    match = THEFORK_RE.search(decoded)
    if not match:
        return None
    slug_id = match.group(1).lower()
    rid = match.group(2)
    return f"https://www.thefork.ch/restaurant/{slug_id}", rid, slug_id


def parse_html(content: str, engine: str) -> list[dict[str, str]]:
    soup = BeautifulSoup(content, "html.parser")
    hits: list[dict[str, str]] = []
    for anchor in soup.find_all("a", href=True):
        parsed = canonicalize(str(anchor.get("href", "")))
        if not parsed:
            continue
        url, rid, slug_id = parsed
        text = " ".join(anchor.get_text(" ", strip=True).split())
        parent = anchor.find_parent(["div", "article", "li", "item"])
        context = " ".join(parent.get_text(" ", strip=True).split())[:2000] if parent else ""
        hits.append({
            "url_thefork": url,
            "restaurant_id": rid,
            "slug_id": slug_id,
            "anchor_text": text[:1200],
            "context_text": context,
            "engine": engine,
        })
    return hits


def fetch(session: requests.Session, url: str) -> dict[str, object]:
    try:
        response = session.get(url, timeout=45, allow_redirects=True)
        return {
            "status": response.status_code,
            "url": response.url,
            "length": len(response.content),
            "text": response.text,
        }
    except Exception as exc:  # noqa: BLE001
        return {"error": repr(exc), "url": url, "status": None, "length": 0, "text": ""}


def main() -> None:
    query = os.environ["TF_QUERY"]
    offset = int(os.environ.get("TF_OFFSET", "0"))
    item_id = os.environ["TF_ITEM_ID"]
    out_dir = Path("artifacts/thefork-geneva-matrix")
    out_dir.mkdir(parents=True, exist_ok=True)

    session = requests.Session()
    session.headers.update({
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/rss+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "fr-CH,fr;q=0.9,en;q=0.7",
    })
    time.sleep(random.uniform(0.1, 1.5))

    brave_url = f"https://search.brave.com/search?q={quote_plus(query)}&offset={offset}&spellcheck=0"
    bing_first = offset * 10 + 1
    bing_url = f"https://www.bing.com/search?format=rss&count=50&first={bing_first}&q={quote_plus(query)}"

    brave = fetch(session, brave_url)
    bing = fetch(session, bing_url)
    brave_hits = parse_html(str(brave.get("text", "")), "brave")
    bing_hits = parse_html(str(bing.get("text", "")), "bing_rss")

    records: dict[str, dict[str, object]] = {}
    for hit in [*brave_hits, *bing_hits]:
        rid = hit["restaurant_id"]
        record = records.setdefault(rid, {
            "restaurant_id": rid,
            "slug_id": hit["slug_id"],
            "url_thefork": hit["url_thefork"],
            "samples": [],
            "engines": [],
        })
        sample = {
            "anchor_text": hit["anchor_text"],
            "context_text": hit["context_text"],
            "engine": hit["engine"],
        }
        if sample not in record["samples"] and len(record["samples"]) < 8:
            record["samples"].append(sample)
        if hit["engine"] not in record["engines"]:
            record["engines"].append(hit["engine"])

    payload = {
        "id": item_id,
        "query": query,
        "offset": offset,
        "brave": {k: v for k, v in brave.items() if k != "text"},
        "bing": {k: v for k, v in bing.items() if k != "text"},
        "records": list(records.values()),
    }
    (out_dir / f"{item_id}.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({
        "id": item_id,
        "query": query,
        "offset": offset,
        "brave_status": brave.get("status"),
        "bing_status": bing.get("status"),
        "brave_hits": len(brave_hits),
        "bing_hits": len(bing_hits),
        "unique": len(records),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
