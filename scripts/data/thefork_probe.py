from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path
from urllib.parse import quote, quote_plus

import requests

THEFORK_PATH = "/restaurants/geneve-c186655?p=1"
TARGET = f"https://www.thefork.ch{THEFORK_PATH}"
URLS = [
    TARGET,
    "https://www.thefork.ch/robots.txt",
    "https://www.thefork.ch/brand-3-index.xml",
    "https://www.thefork.ch/blog/sitemap.xml",
    "https://www.thefork.ch/sitemap.xml",
    "https://www.thefork.ch/sitemap_index.xml",
    "https://www.thefork.ch/sitemap-index.xml",
    "https://www.thefork.ch/sitemaps.xml",
    f"https://www.thefork.be{THEFORK_PATH}",
    f"https://www.thefork.fr{THEFORK_PATH}",
    f"https://www.thefork.de{THEFORK_PATH}",
    f"https://www.thefork.es{THEFORK_PATH}",
    f"https://www.thefork.it{THEFORK_PATH}",
    f"https://www.thefork.com{THEFORK_PATH}",
    "https://www-thefork-ch.translate.goog/restaurants/geneve-c186655?p=1&_x_tr_sl=fr&_x_tr_tl=en&_x_tr_hl=en",
    "https://translate.google.com/translate?sl=fr&tl=en&u=" + quote(TARGET, safe=""),
    TARGET + "&_escaped_fragment_=",
    TARGET + "&output=1",
    TARGET + "&seo=1",
    f"https://r.jina.ai/http://www.thefork.ch{THEFORK_PATH}",
    f"https://r.jina.ai/https://www.thefork.ch{THEFORK_PATH}",
    "https://www.google.com/search?num=100&q=" + quote_plus('site:thefork.ch/restaurant/ Genève TheFork'),
    "https://www.bing.com/search?count=50&q=" + quote_plus('site:thefork.ch/restaurant/ Genève TheFork'),
    "https://html.duckduckgo.com/html/?q=" + quote_plus('site:thefork.ch/restaurant/ Genève TheFork'),
    "https://search.brave.com/search?q=" + quote_plus('site:thefork.ch/restaurant/ Genève TheFork'),
]

USER_AGENTS = {
    "mozilla": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
    "googlebot": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "bingbot": "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
}


def main() -> int:
    out = Path("artifacts/thefork-probe")
    out.mkdir(parents=True, exist_ok=True)
    report: list[dict[str, object]] = []

    for url in URLS:
        for ua_name, ua in USER_AGENTS.items():
            try:
                response = requests.get(
                    url,
                    headers={
                        "User-Agent": ua,
                        "Accept": "text/html,application/xhtml+xml,application/xml,application/json;q=0.9,*/*;q=0.8",
                        "Accept-Language": "fr-CH,fr;q=0.9,en;q=0.7",
                    },
                    timeout=45,
                    allow_redirects=True,
                )
                content = response.content
                key = hashlib.sha256(f"{url}|{ua_name}".encode()).hexdigest()[:12]
                suffix = ".md" if "r.jina.ai" in url else ".txt" if any(token in url for token in ("robots.txt", "sitemap", "index.xml")) else ".html"
                (out / f"{key}-{ua_name}{suffix}").write_bytes(content)
                entry = {
                    "url": url,
                    "ua": ua_name,
                    "status": response.status_code,
                    "final_url": response.url,
                    "content_type": response.headers.get("content-type"),
                    "length": len(content),
                    "contains_restaurant": b"/restaurant/" in content,
                    "restaurant_link_count": content.count(b"/restaurant/"),
                    "contains_sitemap": b"<urlset" in content or b"<sitemapindex" in content,
                    "xml_loc_count": content.count(b"<loc>"),
                    "contains_datadome": b"captcha-delivery.com" in content or b"var dd=" in content,
                    "preview": content[:1500].decode("utf-8", errors="replace"),
                }
            except Exception as exc:  # noqa: BLE001
                entry = {"url": url, "ua": ua_name, "error": repr(exc)}
            report.append(entry)
            print(json.dumps(entry, ensure_ascii=False))

    (out / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
