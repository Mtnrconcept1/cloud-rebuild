from __future__ import annotations

import json
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

OUTPUT = Path("thefork-probe.json")

TARGETS = [
    "https://www.thefork.ch/restaurants/geneve-c186655?p=1",
    "https://r.jina.ai/https://www.thefork.ch/restaurants/geneve-c186655?p=1",
    "https://r.jina.ai/http://www.thefork.ch/restaurants/geneve-c186655?p=1",
    "https://r.jina.ai/https://www.thefork.ch/restaurant/les-ciboulettes-r592029",
    "https://s.jina.ai/?q=" + urllib.parse.quote_plus("Les Ciboulettes Genève email"),
    "https://html.duckduckgo.com/html/?q=" + urllib.parse.quote_plus("Les Ciboulettes Genève email"),
]

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
]


def fetch(url: str, user_agent: str) -> dict[str, object]:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": user_agent,
            "Accept": "text/html,application/xhtml+xml,application/json,text/plain;q=0.9,*/*;q=0.8",
            "Accept-Language": "fr-CH,fr;q=0.9,en;q=0.7",
        },
    )
    context = ssl.create_default_context()
    started = time.time()
    try:
        with urllib.request.urlopen(request, timeout=45, context=context) as response:
            body = response.read(2_000_000)
            text = body.decode(response.headers.get_content_charset() or "utf-8", errors="replace")
            return {
                "url": url,
                "final_url": response.geturl(),
                "user_agent": user_agent,
                "status": response.status,
                "elapsed_seconds": round(time.time() - started, 3),
                "content_type": response.headers.get("Content-Type"),
                "length": len(body),
                "snippet": text[:6000],
            }
    except urllib.error.HTTPError as error:
        body = error.read(2_000_000)
        text = body.decode(error.headers.get_content_charset() or "utf-8", errors="replace")
        return {
            "url": url,
            "final_url": error.geturl(),
            "user_agent": user_agent,
            "status": error.code,
            "elapsed_seconds": round(time.time() - started, 3),
            "content_type": error.headers.get("Content-Type"),
            "length": len(body),
            "snippet": text[:6000],
            "error": str(error),
        }
    except Exception as error:  # noqa: BLE001
        return {
            "url": url,
            "user_agent": user_agent,
            "status": None,
            "elapsed_seconds": round(time.time() - started, 3),
            "error": f"{type(error).__name__}: {error}",
        }


def main() -> None:
    results: list[dict[str, object]] = []
    for target in TARGETS:
        for user_agent in USER_AGENTS:
            results.append(fetch(target, user_agent))
    OUTPUT.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps([{k: row.get(k) for k in ("url", "status", "length", "error")} for row in results], indent=2))


if __name__ == "__main__":
    main()
