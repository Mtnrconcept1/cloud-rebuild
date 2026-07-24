from __future__ import annotations

import html
import json
import os
import re
import time
import unicodedata
from pathlib import Path
from typing import Any
from urllib.parse import quote_plus, urljoin, urlparse, unquote
from xml.etree import ElementTree

import requests
from bs4 import BeautifulSoup

CANDIDATE_PATH = Path(os.environ.get("TF_CANDIDATE_JSON", "input/thefork_geneva_matrix_hits.json"))
OUTPUT_DIR = Path("artifacts/thefork-geneva-email-shards")
SHARD_INDEX = int(os.environ["TF_SHARD_INDEX"])
SHARD_COUNT = int(os.environ["TF_SHARD_COUNT"])
SHARD_NAME = os.environ.get("TF_SHARD_NAME", f"{SHARD_INDEX:03d}")

USER_AGENT = "TOK public restaurant contact research/2026.07 (+https://www.thetok.ch/contact)"
EMAIL_RE = re.compile(r"(?i)(?<![\w.+-])([a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+)")
PHONE_RE = re.compile(r"(?:(?:\+|00)41|0)\s*(?:\(?0?\d{2}\)?[\s./-]*)?\d{3}[\s./-]*\d{2}[\s./-]*\d{2}")

EXCLUDED_DOMAINS = {
    "thefork.ch", "thefork.com", "tripadvisor.ch", "tripadvisor.com", "google.com", "google.ch",
    "facebook.com", "instagram.com", "tiktok.com", "linkedin.com", "youtube.com", "x.com", "twitter.com",
    "yelp.com", "restaurantguru.com", "wanderlog.com", "mapstr.com", "local.ch", "search.ch", "yellowpages.swiss",
    "just-eat.ch", "ubereats.com", "deliveroo.ch", "smood.ch", "swipein.restaurant", "menuweb.menu", "lacarte.menu",
    "falstaff.com", "gaultmillau.ch", "guide.michelin.com", "michelin.com", "booking.com", "hotel.com", "hotels.com",
    "brave.com", "bing.com", "microsoft.com", "duckduckgo.com", "wikipedia.org", "wikimedia.org", "pinterest.com",
}
BAD_EMAIL_TOKENS = {
    "example", "sentry", "noreply", "no-reply", "donotreply", "do-not-reply", "abuse", "webmaster",
    "postmaster", "privacy@", "support@thefork", "@wixpress", "@sentry", "@cloudflare", "@wordpress",
}
CONTACT_HINTS = (
    "contact", "kontakt", "impressum", "mentions-legales", "mentions_legales", "reservation", "reservations",
    "about", "a-propos", "nous-contacter", "restaurant", "team", "equipe",
)
GENEVA_TERMS = (
    "genève", "geneve", "geneva", "genf", "carouge", "meyrin", "vernier", "lancy", "onex", "thônex", "thonex",
    "veyrier", "versoix", "plan-les-ouates", "grand-saconnex", "chêne", "chene", "cologny", "collonge", "chambésy",
    "chambesy", "bellevue", "genthod", "satigny", "bernex", "confignon", "perly", "bardonnex", "troinex",
    "anières", "anieres", "corsier", "hermance", "meinier", "jussy", "presinge", "puplinge", "vandœuvres",
    "vandoeuvres", "soral", "avusy", "laconnex", "cartigny", "aire-la-ville", "avully", "cointrin", "vésenaz",
    "vesenaz", "vessy", "croix-de-rozon", "châtelaine", "chatelaine", "annemasse", "gaillard", "ambilly",
    "ville-la-grand", "ferney-voltaire", "prévessin", "prevessin", "saint-julien-en-genevois", "archamps",
    "collonges-sous-salève", "collonges-sous-saleve", "étrembières", "etrembieres", "bossey", "neydens",
    "saint-genis-pouilly", "divonne-les-bains", "mies", "coppet", "tannay", "nyon",
)


def normalize(value: str) -> str:
    value = unicodedata.normalize("NFKD", value or "")
    value = "".join(char for char in value if not unicodedata.combining(char))
    value = html.unescape(unquote(value)).lower().replace("œ", "oe").replace("&", " et ")
    return " ".join(re.sub(r"[^a-z0-9]+", " ", value).split())


def tokens(value: str) -> list[str]:
    ignored = {"restaurant", "cafe", "brasserie", "bistrot", "bistro", "auberge", "hotel", "le", "la", "les", "de", "des", "du", "chez", "geneve", "geneva"}
    return [token for token in normalize(value).split() if len(token) >= 3 and token not in ignored]


def hostname(url: str) -> str:
    try:
        host = (urlparse(url).hostname or "").lower().removeprefix("www.")
    except Exception:
        return ""
    return host


def is_excluded_host(host: str) -> bool:
    return not host or any(host == domain or host.endswith(f".{domain}") for domain in EXCLUDED_DOMAINS)


def clean_email(raw: str) -> str | None:
    email = html.unescape(raw).strip().strip(".,;:()[]{}<>\"'").lower()
    if len(email) > 254 or email.count("@") != 1:
        return None
    if any(token in email for token in BAD_EMAIL_TOKENS):
        return None
    local, domain = email.rsplit("@", 1)
    if not local or "." not in domain or domain.endswith((".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".js", ".css")):
        return None
    if domain.startswith("mail.") and len(domain.split(".")) < 3:
        return None
    return email


def extract_emails(text: str) -> list[str]:
    found: list[str] = []
    decoded = html.unescape(text or "")
    decoded = re.sub(r"\s*\[at\]\s*|\s*\(at\)\s*", "@", decoded, flags=re.I)
    decoded = re.sub(r"\s*\[dot\]\s*|\s*\(dot\)\s*", ".", decoded, flags=re.I)
    for match in EMAIL_RE.findall(decoded):
        email = clean_email(match)
        if email and email not in found:
            found.append(email)
    return found


def extract_city(candidate: dict[str, Any]) -> str:
    texts = " ".join(
        f"{sample.get('anchor_text', '')} {sample.get('context_text', '')}"
        for sample in candidate.get("samples", [])
    )
    lowered = texts.lower()
    for term in GENEVA_TERMS:
        if term.lower() in lowered:
            return term.title()
    return "Genève"


def get(session: requests.Session, url: str, *, timeout: int = 18) -> requests.Response | None:
    try:
        response = session.get(url, timeout=timeout, allow_redirects=True)
        if len(response.content) > 3_000_000:
            return None
        return response
    except requests.RequestException:
        return None


def brave_results(session: requests.Session, query: str) -> list[dict[str, str]]:
    response = get(session, f"https://search.brave.com/search?q={quote_plus(query)}&spellcheck=0")
    if response is None or response.status_code != 200:
        return []
    soup = BeautifulSoup(response.text, "html.parser")
    results: list[dict[str, str]] = []
    for anchor in soup.find_all("a", href=True):
        url = html.unescape(str(anchor.get("href", "")))
        if not url.startswith(("http://", "https://")):
            continue
        title = " ".join(anchor.get_text(" ", strip=True).split())
        parent = anchor.find_parent(["div", "article", "li"])
        snippet = " ".join(parent.get_text(" ", strip=True).split())[:2500] if parent else title
        results.append({"url": url, "title": title, "snippet": snippet, "engine": "brave"})
    return results


def bing_results(session: requests.Session, query: str) -> list[dict[str, str]]:
    response = get(session, f"https://www.bing.com/search?format=rss&count=50&q={quote_plus(query)}")
    if response is None or response.status_code != 200:
        return []
    try:
        root = ElementTree.fromstring(response.content)
    except ElementTree.ParseError:
        return []
    results: list[dict[str, str]] = []
    for item in root.findall(".//item"):
        url = (item.findtext("link") or "").strip()
        title = (item.findtext("title") or "").strip()
        snippet = BeautifulSoup(item.findtext("description") or "", "html.parser").get_text(" ", strip=True)
        if url:
            results.append({"url": url, "title": title, "snippet": snippet, "engine": "bing_rss"})
    return results


def search_score(result: dict[str, str], name: str, city: str) -> int:
    host = hostname(result["url"])
    if is_excluded_host(host):
        return -100
    name_tokens = tokens(name)
    host_norm = normalize(host.replace(".", " "))
    text_norm = normalize(f"{result.get('title', '')} {result.get('snippet', '')}")
    score = 0
    score += sum(18 for token in name_tokens if token in host_norm)
    score += sum(8 for token in name_tokens if token in text_norm)
    if normalize(city) in text_norm:
        score += 12
    if "restaurant" in text_norm or "cuisine" in text_norm or "menu" in text_norm:
        score += 4
    if host.endswith((".ch", ".com", ".restaurant", ".fr")):
        score += 2
    return score


def crawl_public_site(session: requests.Session, start_url: str, name: str, city: str) -> tuple[list[dict[str, Any]], dict[str, str]]:
    queue = [start_url]
    visited: set[str] = set()
    email_rows: list[dict[str, Any]] = []
    site_facts: dict[str, str] = {"website": start_url, "phone": "", "address_text": ""}
    root_host = hostname(start_url)

    while queue and len(visited) < 4:
        url = queue.pop(0)
        if url in visited:
            continue
        visited.add(url)
        response = get(session, url)
        if response is None or response.status_code >= 400:
            continue
        content_type = (response.headers.get("content-type") or "").lower()
        if "html" not in content_type and "text" not in content_type:
            continue
        text = response.text
        soup = BeautifulSoup(text, "html.parser")
        visible = " ".join(soup.get_text(" ", strip=True).split())
        page_name_score = sum(1 for token in tokens(name) if token in normalize(visible[:6000]))
        city_present = normalize(city) in normalize(visible[:10000]) or any(term in normalize(visible[:10000]) for term in ("geneve", "geneva", "carouge"))

        page_emails = extract_emails(text)
        for anchor in soup.select('a[href^="mailto:"]'):
            page_emails.extend(extract_emails(str(anchor.get("href", ""))))
        for email in dict.fromkeys(page_emails):
            email_domain = email.rsplit("@", 1)[1]
            domain_match = email_domain == root_host or root_host.endswith(email_domain) or email_domain.endswith(root_host)
            confidence = "high" if domain_match and (page_name_score > 0 or city_present) else "medium" if page_name_score > 0 and city_present else "low"
            email_rows.append({
                "email": email,
                "source_url": response.url,
                "source_type": "official_website",
                "confidence": confidence,
                "domain_match": domain_match,
            })

        if not site_facts["phone"]:
            phone_match = PHONE_RE.search(visible)
            if phone_match:
                site_facts["phone"] = " ".join(phone_match.group(0).split())
        if not site_facts["address_text"]:
            address_match = re.search(r"(?i)(?:rue|route|avenue|av\.|boulevard|bd|chemin|chem\.|place|pl\.|quai|rampe)[^\n|]{3,120}\b(?:12\d{2}|74\d{3}|01\d{3})\b[^\n|]{0,80}", visible)
            if address_match:
                site_facts["address_text"] = " ".join(address_match.group(0).split())[:240]

        for anchor in soup.find_all("a", href=True):
            href = str(anchor.get("href", ""))
            text_hint = normalize(f"{anchor.get_text(' ', strip=True)} {href}")
            if not any(hint in text_hint for hint in CONTACT_HINTS):
                continue
            absolute = urljoin(response.url, href).split("#", 1)[0]
            if hostname(absolute) == root_host and absolute not in visited and absolute not in queue:
                queue.append(absolute)
                if len(queue) >= 5:
                    break
        time.sleep(0.15)

    deduped: dict[tuple[str, str], dict[str, Any]] = {}
    for row in email_rows:
        key = (row["email"], row["source_url"])
        deduped[key] = row
    return list(deduped.values()), site_facts


def nominatim_lookup(session: requests.Session, name: str, city: str) -> dict[str, Any]:
    params = {
        "q": f"{name}, {city}",
        "format": "jsonv2",
        "addressdetails": "1",
        "extratags": "1",
        "namedetails": "1",
        "limit": "3",
        "countrycodes": "ch,fr",
    }
    try:
        response = session.get("https://nominatim.openstreetmap.org/search", params=params, timeout=20)
    except requests.RequestException:
        return {}
    if response.status_code != 200:
        return {}
    try:
        options = response.json()
    except ValueError:
        return {}
    name_tokens = tokens(name)
    for option in options:
        display = normalize(str(option.get("display_name", "")))
        if name_tokens and sum(token in display for token in name_tokens) < max(1, min(2, len(name_tokens))):
            continue
        if not any(term in display for term in ("geneve", "geneva", "carouge", "meyrin", "vernier", "lancy", "annemasse", "gaillard", "ferney", "saint julien", "archamps", "prevessin", "divonne")):
            continue
        extra = option.get("extratags") or {}
        email = extra.get("email") or extra.get("contact:email") or ""
        phone = extra.get("phone") or extra.get("contact:phone") or ""
        website = extra.get("website") or extra.get("contact:website") or ""
        return {
            "email": clean_email(str(email)) or "",
            "phone": str(phone).strip(),
            "website": str(website).strip(),
            "latitude": str(option.get("lat", "")),
            "longitude": str(option.get("lon", "")),
            "address_text": str(option.get("display_name", "")),
            "source_url": f"https://www.openstreetmap.org/{option.get('osm_type', '')}/{option.get('osm_id', '')}",
        }
    return {}


def enrich_candidate(session: requests.Session, candidate: dict[str, Any]) -> dict[str, Any]:
    name = str(candidate.get("restaurant_name_inferred", "")).strip()
    city = extract_city(candidate)
    query = f'"{name}" "{city}" restaurant contact email'
    results = [*brave_results(session, query), *bing_results(session, query)]

    search_email_rows: list[dict[str, Any]] = []
    ranked_sites: list[tuple[int, str, dict[str, str]]] = []
    seen_urls: set[str] = set()
    for result in results:
        result_url = result.get("url", "")
        if result_url in seen_urls:
            continue
        seen_urls.add(result_url)
        score = search_score(result, name, city)
        if score >= 10:
            ranked_sites.append((score, result_url, result))
        for email in extract_emails(f"{result.get('title', '')} {result.get('snippet', '')}"):
            if score >= 18:
                search_email_rows.append({
                    "email": email,
                    "source_url": result_url,
                    "source_type": f"search_snippet_{result.get('engine', 'web')}",
                    "confidence": "medium" if score >= 30 else "low",
                    "domain_match": email.rsplit("@", 1)[1] in hostname(result_url),
                })

    osm = nominatim_lookup(session, name, city)
    if osm.get("email"):
        search_email_rows.append({
            "email": osm["email"],
            "source_url": osm.get("source_url", ""),
            "source_type": "openstreetmap_public_tag",
            "confidence": "high",
            "domain_match": True,
        })
    if osm.get("website") and not is_excluded_host(hostname(osm["website"])):
        ranked_sites.append((80, osm["website"], {"url": osm["website"], "title": name, "snippet": osm.get("address_text", ""), "engine": "openstreetmap"}))

    crawled_emails: list[dict[str, Any]] = []
    site_facts: dict[str, str] = {"website": "", "phone": "", "address_text": ""}
    crawled_hosts: set[str] = set()
    for score, url, _result in sorted(ranked_sites, key=lambda item: item[0], reverse=True):
        host = hostname(url)
        if score < 18 or host in crawled_hosts or is_excluded_host(host):
            continue
        crawled_hosts.add(host)
        emails, facts = crawl_public_site(session, url, name, city)
        crawled_emails.extend(emails)
        if not site_facts["website"]:
            site_facts = facts
        else:
            site_facts["phone"] = site_facts["phone"] or facts.get("phone", "")
            site_facts["address_text"] = site_facts["address_text"] or facts.get("address_text", "")
        if any(row["confidence"] == "high" for row in crawled_emails) or len(crawled_hosts) >= 3:
            break

    all_email_rows = [*crawled_emails, *search_email_rows]
    priority = {"high": 3, "medium": 2, "low": 1}
    all_email_rows.sort(
        key=lambda row: (
            priority.get(str(row.get("confidence", "low")), 0),
            bool(row.get("domain_match")),
            str(row.get("source_type", "")).startswith("official"),
        ),
        reverse=True,
    )
    unique_rows: list[dict[str, Any]] = []
    seen_emails: set[str] = set()
    for row in all_email_rows:
        if row["email"] in seen_emails:
            continue
        seen_emails.add(row["email"])
        unique_rows.append(row)

    best = unique_rows[0] if unique_rows else {}
    website = site_facts.get("website") or osm.get("website", "")
    phone = site_facts.get("phone") or osm.get("phone", "")
    address_text = site_facts.get("address_text") or osm.get("address_text", "")
    return {
        "restaurant_id": candidate.get("restaurant_id", ""),
        "restaurant_name_inferred": name,
        "url_thefork": candidate.get("url_thefork", ""),
        "city_hint": city,
        "email": best.get("email", ""),
        "email_status": "public_verified" if best.get("confidence") == "high" else "public_candidate" if best else "not_found_publicly",
        "email_confidence": best.get("confidence", ""),
        "email_source_url": best.get("source_url", ""),
        "email_source_type": best.get("source_type", ""),
        "email_candidates": unique_rows[:8],
        "telephone": phone,
        "site_web": website,
        "address_text_web": address_text,
        "latitude": osm.get("latitude", ""),
        "longitude": osm.get("longitude", ""),
        "search_query": query,
        "searched_urls": [item[1] for item in sorted(ranked_sites, key=lambda item: item[0], reverse=True)[:8]],
    }


def main() -> None:
    candidates = json.loads(CANDIDATE_PATH.read_text(encoding="utf-8"))
    assigned = [candidate for index, candidate in enumerate(candidates) if index % SHARD_COUNT == SHARD_INDEX]
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    session = requests.Session()
    session.headers.update({
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/rss+xml,application/xml,application/json;q=0.9,*/*;q=0.8",
        "Accept-Language": "fr-CH,fr;q=0.9,en;q=0.6",
    })

    rows: list[dict[str, Any]] = []
    for candidate in assigned:
        rows.append(enrich_candidate(session, candidate))
        time.sleep(0.25)

    output_path = OUTPUT_DIR / f"{SHARD_NAME}.json"
    output_path.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({
        "shard": SHARD_NAME,
        "assigned": len(assigned),
        "email_found": sum(bool(row["email"]) for row in rows),
        "website_found": sum(bool(row["site_web"]) for row in rows),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
