from __future__ import annotations

import base64
import bz2
import hashlib
import json
import math
import re
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
PAYLOAD = ROOT / "scripts/.tmp/thefork-geneva-520.bz2.b64"
BASE = ROOT / "public/data/geneva-commercial-prospects.json"
OUTPUT = ROOT / "public/data/geneva-thefork-commercial-prospects.json"
REPORT = ROOT / "docs/data/thefork-commercial-map-import-2026-07-24.md"
PAGE = ROOT / "src/pages/CommercialProspection.tsx"
EXPECTED = 520
ID_BASE = 2_600_000_000
SEARCH_URL = "https://api3.geo.admin.ch/rest/services/ech/SearchServer"
UA = "TOK-commercial-map-import/1.0 (https://www.thetok.ch)"


def text(value: Any) -> str:
    return str(value or "").strip()


def opt(value: Any) -> str | None:
    value = text(value)
    return value or None


def norm(value: Any) -> str:
    value = unicodedata.normalize("NFKD", text(value))
    value = "".join(c for c in value if not unicodedata.combining(c)).casefold()
    value = re.sub(r"\b(sa|sarl|sàrl|snc|sagl|ltd|ag|gmbh|restaurant|cafe|café|bar|hotel|hôtel)\b", " ", value)
    return re.sub(r"[^a-z0-9]+", " ", value).strip()


def street(value: Any) -> str:
    words = norm(value).split()
    aliases = {"avenue": "av", "boulevard": "bd", "chemin": "ch", "route": "rte", "place": "pl"}
    return " ".join(aliases.get(word, word) for word in words)


def phone(value: Any) -> str:
    value = re.sub(r"\D+", "", text(value))
    value = re.sub(r"^(?:0041|41|0)", "", value)
    return value


def host(value: Any) -> str:
    value = text(value)
    if not value:
        return ""
    try:
        parsed = urllib.parse.urlparse(value if "://" in value else f"https://{value}")
        return (parsed.hostname or "").casefold().removeprefix("www.")
    except ValueError:
        return ""


def addr_key(address: Any, postcode: Any) -> str:
    return f"{text(postcode).replace('CH-', '')}|{street(address)}"


def number(value: Any) -> float | None:
    try:
        value = float(text(value).replace(",", "."))
        return value if math.isfinite(value) else None
    except ValueError:
        return None


def valid(lat: float | None, lon: float | None) -> bool:
    return lat is not None and lon is not None and 45 <= lat <= 48.2 and 5 <= lon <= 11


def jitter(seed: str, radius: float = 0.00012) -> tuple[float, float]:
    digest = hashlib.sha256(seed.encode()).digest()
    angle = int.from_bytes(digest[:4], "big") / (2**32 - 1) * 2 * math.pi
    magnitude = .35 + int.from_bytes(digest[4:8], "big") / (2**32 - 1) * .65
    return math.cos(angle) * radius * magnitude, math.sin(angle) * radius * magnitude


def load_rows() -> list[dict[str, str]]:
    raw = bz2.decompress(base64.b64decode(PAYLOAD.read_text())).decode()
    rows = json.loads(raw)
    if not isinstance(rows, list) or len(rows) != EXPECTED:
        raise RuntimeError(f"Expected {EXPECTED} rows, found {len(rows) if isinstance(rows, list) else 'invalid'}")
    return [{str(k): text(v) for k, v in row.items()} for row in rows]


def build_indexes(base: list[dict[str, Any]]):
    indexes = {key: defaultdict(list) for key in ("email", "phone", "host", "address", "postcode")}
    for pos, prospect in enumerate(base):
        values = {
            "email": text(prospect.get("email")).casefold(),
            "phone": phone(prospect.get("phone")),
            "host": host(prospect.get("website")),
            "address": addr_key(prospect.get("address"), prospect.get("postalCode")),
            "postcode": text(prospect.get("postalCode")),
        }
        for key, value in values.items():
            if value:
                indexes[key][value].append(pos)
    return indexes


def score(row: dict[str, str], prospect: dict[str, Any]) -> tuple[float, list[str]]:
    result, reasons = 0.0, []
    checks = (
        ("email", text(row.get("email")).casefold(), text(prospect.get("email")).casefold(), 150),
        ("phone", phone(row.get("telephone")), phone(prospect.get("phone")), 130),
        ("website", host(row.get("site_web")), host(prospect.get("website")), 115),
        ("address", addr_key(row.get("rue"), row.get("code_postal")), addr_key(prospect.get("address"), prospect.get("postalCode")), 90),
    )
    for reason, left, right, points in checks:
        if left and right and left == right:
            result += points
            reasons.append(reason)
    row_name = norm(row.get("restaurant_name"))
    names = [norm(prospect.get("name")), norm(prospect.get("legalName"))]
    similarity = max((SequenceMatcher(None, row_name, name).ratio() for name in names if name), default=0)
    if row_name and row_name in names:
        result += 80; reasons.append("name_exact")
    elif similarity >= .86:
        result += 58; reasons.append("name_high")
    elif similarity >= .64:
        result += 34; reasons.append("name_medium")
    elif similarity >= .45:
        result += 18; reasons.append("name_low")
    if text(row.get("code_postal")).replace("CH-", "") == text(prospect.get("postalCode")):
        result += 8
    if "address" not in reasons and similarity < .45 and result < 130:
        return 0, []
    return result, reasons


def match_base(row, base, indexes, used):
    lookups = {
        "email": text(row.get("email")).casefold(),
        "phone": phone(row.get("telephone")),
        "host": host(row.get("site_web")),
        "address": addr_key(row.get("rue"), row.get("code_postal")),
        "postcode": text(row.get("code_postal")).replace("CH-", ""),
    }
    candidates = set()
    for key, value in lookups.items():
        if value:
            candidates.update(indexes[key].get(value, []))
    ranked = []
    for pos in candidates:
        prospect = base[pos]
        source_id = int(prospect["sourceObjectId"])
        if source_id in used:
            continue
        points, reasons = score(row, prospect)
        if points:
            establishment = 6 if norm(prospect.get("registryType")) == "etablissement" else 0
            ranked.append((points + establishment, prospect, reasons))
    if not ranked:
        return None
    ranked.sort(key=lambda item: item[0], reverse=True)
    points, prospect, reasons = ranked[0]
    strong = any(reason in reasons for reason in ("email", "phone", "website"))
    address_name = "address" in reasons and any(reason.startswith("name_") for reason in reasons)
    exact_postcode = "name_exact" in reasons and text(row.get("code_postal")).replace("CH-", "") == text(prospect.get("postalCode"))
    return (prospect, points, "+".join(reasons)) if points >= 130 or strong or address_name or exact_postcode else None


def centroids(base):
    postcode, city = defaultdict(list), defaultdict(list)
    for prospect in base:
        lat, lon = number(prospect.get("latitude")), number(prospect.get("longitude"))
        if not valid(lat, lon):
            continue
        if text(prospect.get("postalCode")):
            postcode[text(prospect.get("postalCode"))].append((lat, lon))
        locality = norm(prospect.get("locality") or prospect.get("commune"))
        if locality:
            city[locality].append((lat, lon))
    def middle(points):
        lats, lons = sorted(p[0] for p in points), sorted(p[1] for p in points)
        i = len(points) // 2
        return (lats[i], lons[i]) if len(points) % 2 else ((lats[i-1]+lats[i])/2, (lons[i-1]+lons[i])/2)
    return {k: middle(v) for k, v in postcode.items()}, {k: middle(v) for k, v in city.items()}


def search(query: str):
    params = urllib.parse.urlencode({"searchText": query, "type": "locations", "origins": "address", "limit": 10, "sr": 4326})
    request = urllib.request.Request(f"{SEARCH_URL}?{params}", headers={"Accept": "application/json", "User-Agent": UA})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                payload = json.load(response)
            for result in payload.get("results", []):
                attrs = result.get("attrs", {})
                lat, lon = number(attrs.get("lat")), number(attrs.get("lon"))
                if valid(lat, lon):
                    return lat, lon, re.sub(r"<[^>]+>", "", text(attrs.get("label")))
            return None
        except urllib.error.HTTPError as error:
            if error.code not in {429, 500, 502, 503, 504} or attempt == 3:
                return None
            time.sleep(.8 * (attempt + 1))
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
            if attempt == 3:
                return None
            time.sleep(.8 * (attempt + 1))
    return None


def coordinates(row, match, postal_centres, city_centres):
    lat, lon = number(row.get("latitude")), number(row.get("longitude"))
    if valid(lat, lon):
        return lat, lon, "csv_verified", "provided", None
    if match:
        lat, lon = number(match[0].get("latitude")), number(match[0].get("longitude"))
        if valid(lat, lon):
            return lat, lon, "existing_commercial_map", "matched_exact", None
    street_name, postcode, locality = text(row.get("rue")), text(row.get("code_postal")).replace("CH-", ""), text(row.get("ville"))
    queries = []
    if street_name:
        queries += [f"{street_name}, {postcode} {locality}, Suisse", f"{text(row.get('restaurant_name'))}, {street_name}, {postcode} {locality}"]
    queries.append(f"{postcode} {locality}, Suisse")
    for pos, query in enumerate(dict.fromkeys(q for q in queries if q.strip())):
        result = search(query)
        if result:
            return result[0], result[1], "swisstopo_searchserver", "address_search" if pos < 2 and street_name else "locality_search", result[2]
        time.sleep(.08)
    centre = postal_centres.get(postcode)
    source, precision = "commercial_map_postcode_centroid", "postal_centroid"
    if centre is None:
        centre = city_centres.get(norm(locality))
        source, precision = "commercial_map_city_centroid", "city_centroid"
    if centre is None:
        centre = {"tannay": (46.3081, 6.1814), "founex": (46.3327, 6.1920)}.get(norm(locality), (46.2044, 6.1432))
        source, precision = "configured_locality_fallback", "city_centroid"
    dlat, dlon = jitter(f"{row.get('index')}|{row.get('restaurant_name')}|{row.get('rue')}")
    return centre[0] + dlat, centre[1] + dlon, source, precision, None


def record(row, match, coords):
    prospect = match[0] if match else {}
    idx = int(row["index"])
    direct = opt(row.get("url_thefork"))
    source_url = direct or opt(row.get("source_thefork"))
    cuisine = opt(row.get("cuisine"))
    return {
        "sourceObjectId": int(prospect["sourceObjectId"]) if match else ID_BASE + idx,
        "name": text(row.get("restaurant_name")),
        "legalName": opt(prospect.get("legalName")),
        "registryType": opt(prospect.get("registryType")) or "TheFork",
        "category": cuisine or opt(prospect.get("category")) or "Restaurant TheFork",
        "branch": opt(prospect.get("branch")) or "Restaurant référencé sur TheFork",
        "activityDetail": cuisine or opt(prospect.get("activityDetail")),
        "address": opt(row.get("rue")) or opt(prospect.get("address")),
        "postalCode": text(row.get("code_postal")).replace("CH-", "") or opt(prospect.get("postalCode")),
        "locality": opt(row.get("ville")) or opt(prospect.get("locality")),
        "commune": opt(row.get("ville")) or opt(prospect.get("commune")),
        "phone": opt(row.get("telephone")) or opt(prospect.get("phone")),
        "email": opt(row.get("email")) or opt(prospect.get("email")),
        "website": opt(row.get("site_web")) or opt(prospect.get("website")),
        "companySize": opt(prospect.get("companySize")), "localType": opt(prospect.get("localType")),
        "establishmentId": opt(prospect.get("establishmentId")), "companyId": opt(prospect.get("companyId")),
        "ideNumber": opt(prospect.get("ideNumber")), "latitude": round(coords[0], 7), "longitude": round(coords[1], 7),
        "source": "TheFork Genève 2026-07-24 + coordonnées professionnelles publiques", "collectedAt": "2026-07-24",
        "isTheFork": True, "theForkUrl": source_url, "theForkDirectUrl": direct,
        "coordinateSource": coords[2], "coordinatePrecision": coords[3], "coordinateLabel": coords[4],
        "sourceContact": opt(row.get("source_contact")), "contactConfidence": number(row.get("confiance_contact")) or 0,
        "baseMatchReason": match[2] if match else None, "baseMatchScore": round(match[1], 2) if match else None,
    }


FORK_MARKER = '''function commercialForkSvg(color: string, size: number) {
  return `
    <svg data-commercial-marker="fork" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="${color}" d="M6 2v7a4 4 0 0 0 3 3.87V22h2v-9.13A4 4 0 0 0 14 9V2h-2v5h-1V2H9v5H8V2H6Z" />
    </svg>
  `;
}

function commercialProspectMarkerIcon(
  prospect: GenevaCommercialProspect,
  meta: StatusMeta,
  selected: boolean,
) {
  const size = selected ? 42 : 36;
  const innerSize = selected ? 23 : 20;
  const ringColor = selected ? "#020617" : "#ffffff";
  const isTheForkProspect = prospect.isTheFork === true;
  const glyph = isTheForkProspect
    ? commercialForkSvg("#ffffff", innerSize)
    : `<span style="width:${innerSize}px;height:${innerSize}px;border-radius:9999px;display:block;background:${meta.marker};box-shadow:0 0 0 2px rgba(255,255,255,.94),0 0 22px ${meta.marker};"></span>`;

  return L.divIcon({
    html: `<div data-commercial-source="${isTheForkProspect ? "thefork" : "registry"}" style="width:${size}px;height:${size}px;border-radius:9999px;display:flex;align-items:center;justify-content:center;background:${isTheForkProspect ? meta.marker : "rgba(255,255,255,.96)"};border:2px solid ${ringColor};box-shadow:0 14px 30px rgba(15,23,42,.24),0 0 0 ${selected ? "5px" : "3px"} rgba(255,255,255,.72),0 0 22px ${meta.marker};">${glyph}</div>`,
    className: "", iconSize: [size, size], iconAnchor: [size / 2, size / 2],
  });
}

function getCommercialClusterCellSize'''


def patch_page():
    page = PAGE.read_text()
    visited = re.compile(r'(value: "visited",\s+label: COMMERCIAL_FOLLOWUP_STATUS_LABELS\.visited,\s+shortLabel: COMMERCIAL_FOLLOWUP_STATUS_LABELS\.visited,\s+)color: "#2563eb",\s+marker: "#2563eb",\s+badge: "bg-blue-100 text-blue-700 border-blue-200",', re.M)
    page, count = visited.subn(r'\1color: "#f97316",\n    marker: "#f97316",\n    badge: "bg-orange-100 text-orange-700 border-orange-200",', page, count=1)
    if count != 1: raise RuntimeError(f"visited colour patch failed: {count}")
    marker = re.compile(r'function commercialProspectMarkerIcon\(meta: StatusMeta, selected: boolean\) \{.*?\n\}\n\nfunction getCommercialClusterCellSize', re.S)
    page, count = marker.subn(FORK_MARKER, page, count=1)
    if count != 1: raise RuntimeError(f"marker patch failed: {count}")
    old = "commercialProspectMarkerIcon(point.meta, point.selected)"
    if old not in page: raise RuntimeError("marker call not found")
    page = page.replace(old, "commercialProspectMarkerIcon(point.prospect, point.meta, point.selected)", 1)
    anchor = '''            <ContactLink
              icon={ExternalLink}
              href={normalizeExternalUrl(prospect.website)}
              label={prospect.website ? "Site web" : null}
            />
'''
    if anchor not in page: raise RuntimeError("website contact block not found")
    page = page.replace(anchor, anchor + '''            <ContactLink
              icon={Store}
              href={normalizeExternalUrl(prospect.theForkUrl || null)}
              label={prospect.theForkUrl ? "Fiche TheFork" : null}
            />
''', 1)
    PAGE.write_text(page)


def main():
    rows = load_rows()
    base = json.loads(BASE.read_text())
    if not isinstance(base, list) or len(base) < 4000: raise RuntimeError("base commercial source unavailable")
    indexes = build_indexes(base)
    postal, cities = centroids(base)
    used, records, matched = set(), [], 0
    for pos, row in enumerate(rows, 1):
        match = match_base(row, base, indexes, used)
        if match:
            used.add(int(match[0]["sourceObjectId"])); matched += 1
        coords = coordinates(row, match, postal, cities)
        if not valid(coords[0], coords[1]): raise RuntimeError(f"invalid coordinates: {row.get('restaurant_name')}")
        records.append(record(row, match, coords))
        if pos % 50 == 0: print(f"processed {pos}/{EXPECTED}", flush=True)
    ids = [r["sourceObjectId"] for r in records]
    venue_keys = [f"{norm(r['name'])}|{street(r['address'])}|{r['postalCode']}" for r in records]
    if len(records) != EXPECTED or len(set(ids)) != EXPECTED or len(set(venue_keys)) != EXPECTED:
        raise RuntimeError("record count or deduplication validation failed")
    if any(not text(r.get("theForkUrl")).startswith("https://www.thefork.ch/") for r in records):
        raise RuntimeError("missing TheFork source URL")
    OUTPUT.write_text(json.dumps(records, ensure_ascii=False, separators=(",", ":")) + "\n")
    counts = defaultdict(int)
    for r in records: counts[r["coordinatePrecision"]] += 1
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join([
        "# Import TheFork — carte commerciale TOK", "", "- Date : 24 juillet 2026",
        f"- Restaurants traités : {len(records)}", f"- Rapprochés d’un prospect existant : {matched}",
        f"- Nouveaux identifiants : {len(records)-matched}", f"- E-mails disponibles : {sum(bool(r['email']) for r in records)}",
        f"- Téléphones disponibles : {sum(bool(r['phone']) for r in records)}", f"- Sites disponibles : {sum(bool(r['website']) for r in records)}",
        "", "## Précision des coordonnées", "", *[f"- `{key}` : {value}" for key, value in sorted(counts.items())],
        "", "## Déduplication", "", "Les correspondances conservent le `sourceObjectId` historique : les statuts Supabase existants ne sont pas réinitialisés. Les nouveaux établissements utilisent la plage `2600000001–2600000520`.", "",
    ]))
    patch_page()
    print(json.dumps({"records": len(records), "matched": matched, "new": len(records)-matched, "coordinates": counts}, ensure_ascii=False), flush=True)


if __name__ == "__main__": main()
