#!/usr/bin/env python3
"""Generate TOK public REG/SITG listings from the user-provided workbook selection.

The 2,230 source establishments are frozen by stable public ID_ETABLISSEMENT values.
Current SITG data is preferred when it still matches the frozen restaurant/bar scope.
A privacy-minimized workbook snapshot dated 2026-05-26 is the fallback for records
that disappeared, changed scope, or lost required public location fields.
No email, fax, IDE, company size, secondary/scraped phone or photo is requested/stored.
"""

from __future__ import annotations

import base64
import json
import math
import re
import unicodedata
import urllib.parse
import urllib.request
import zlib
from pathlib import Path

SOURCE_LABEL = "REG/SITG – Répertoire des entreprises et établissements"
SOURCE_URL = "https://sitg.ge.ch/donnees/reg-entreprise-etablissement"
ARCGIS_QUERY_URL = "https://vector.sitg.ge.ch/arcgis/rest/services/REG_ENTREPRISE_ETABLISSEMENT/FeatureServer/0/query"
SOURCE_SELECTION_DATE = "2026-05-26"
SOURCE_REFRESH_DATE = "2026-08-30"
EXPECTED_COUNT = 2230
ALLOWED_NOGA = {"561001", "561003", "563001", "563002"}
ID_DIRECTORY = Path("scripts/public-reg-ids")
FALLBACK_PATH = Path("scripts/public-reg-fallback.b64")
OUTPUT_PATH = Path("supabase/migrations/20260829220500_seed_public_registry_restaurants.sql")

OUT_FIELDS = ",".join([
    "ID_ETABLISSEMENT", "TYPE_REG", "NOM", "COMPLEMENT_LOCALI", "CODE_NOGA",
    "ACTIVITE_DETAIL", "TEL_PRINCIPAL", "SITE_INTERNET", "ADRESSE", "PHYS_NPA",
    "PHYS_LOCALITE", "PHYS_COMMUNE",
])
FALLBACK_KEYS = {
    "id_etablissement", "type_reg", "code_noga", "name", "category", "activity_detail",
    "address", "postal_code", "city", "municipality", "phone", "website_url",
    "latitude", "longitude", "collected_on",
}


def load_stable_ids() -> list[str]:
    paths = sorted(ID_DIRECTORY.glob("*.txt"))
    if len(paths) != 12:
        raise RuntimeError(f"Expected 12 stable REG ID files, got {len(paths)}")
    stable_ids = [line.strip() for path in paths for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    if len(stable_ids) != EXPECTED_COUNT or len(set(stable_ids)) != EXPECTED_COUNT:
        raise RuntimeError(f"Frozen workbook selection must contain exactly {EXPECTED_COUNT} unique stable REG IDs")
    if any(not re.fullmatch(r"[A-Za-z0-9-]+", value) for value in stable_ids):
        raise RuntimeError("Frozen workbook selection contains an invalid REG establishment ID")
    return stable_ids


def load_fallback() -> dict[str, dict]:
    encoded = FALLBACK_PATH.read_text(encoding="utf-8").strip()
    records = json.loads(zlib.decompress(base64.b64decode(encoded)).decode("utf-8"))
    if not isinstance(records, list) or not records:
        raise RuntimeError("Workbook fallback must contain a non-empty list")
    result = {}
    for record in records:
        if not isinstance(record, dict) or set(record) != FALLBACK_KEYS:
            raise RuntimeError("Workbook fallback contains unexpected fields")
        stable_id = str(record["id_etablissement"] or "").strip()
        if stable_id in result:
            raise RuntimeError(f"Duplicate fallback REG ID: {stable_id}")
        if record["type_reg"] != "Etablissement" or str(record["code_noga"]) not in ALLOWED_NOGA:
            raise RuntimeError(f"Fallback REG ID {stable_id} is outside restaurant/bar scope")
        if not record["name"] or not record["address"] or not record["city"]:
            raise RuntimeError(f"Fallback REG ID {stable_id} lacks required public location fields")
        result[stable_id] = record
    return result


def sql_quote(value):
    if value is None or value == "":
        return "NULL"
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
            return "NULL"
        return repr(value)
    return "'" + str(value).replace("'", "''") + "'"


def slugify(value):
    value = unicodedata.normalize("NFKD", str(value or ""))
    value = "".join(char for char in value if not unicodedata.combining(char)).lower()
    return re.sub(r"[^a-z0-9]+", "-", value).strip("-") or "restaurant"


def fetch_batch(stable_ids):
    quoted = ",".join("'" + value.replace("'", "''") + "'" for value in stable_ids)
    form = urllib.parse.urlencode({
        "where": f"ID_ETABLISSEMENT IN ({quoted})",
        "outFields": OUT_FIELDS,
        "returnGeometry": "true",
        "outSR": "4326",
        "f": "json",
    }).encode("utf-8")
    request = urllib.request.Request(ARCGIS_QUERY_URL, data=form, method="POST")
    with urllib.request.urlopen(request, timeout=60) as response:
        payload = json.load(response)
    if payload.get("error"):
        raise RuntimeError(f"ArcGIS error: {payload['error']}")
    return payload.get("features", [])


def normalize_live(stable_id: str, feature: dict) -> dict:
    attrs = feature.get("attributes") or {}
    geometry = feature.get("geometry") or {}
    type_reg = str(attrs.get("TYPE_REG") or "").strip()
    code_noga = str(attrs.get("CODE_NOGA") or "").strip()
    if type_reg != "Etablissement" or code_noga not in ALLOWED_NOGA:
        raise ValueError(f"scope:{type_reg}:{code_noga}")
    name = str(attrs.get("NOM") or "").strip()
    address = str(attrs.get("ADRESSE") or "").strip()
    city = str(attrs.get("PHYS_LOCALITE") or attrs.get("PHYS_COMMUNE") or "").strip()
    if not name or not address or not city:
        raise ValueError("required_location_field_missing")
    complement = str(attrs.get("COMPLEMENT_LOCALI") or "").strip()
    website = str(attrs.get("SITE_INTERNET") or "").strip() or None
    if website and not re.match(r"^https?://", website, re.I):
        website = None
    return {
        "id_etablissement": stable_id,
        "code_noga": code_noga,
        "name": name,
        "category": "Bar" if code_noga in {"563001", "563002"} else "Restaurant/cafe/snack/tea-room",
        "activity_detail": str(attrs.get("ACTIVITE_DETAIL") or "").strip() or None,
        "address": f"{address} — {complement}" if complement else address,
        "postal_code": str(attrs.get("PHYS_NPA") or "").strip() or None,
        "city": city,
        "municipality": str(attrs.get("PHYS_COMMUNE") or "").strip() or None,
        "phone": str(attrs.get("TEL_PRINCIPAL") or "").strip() or None,
        "website_url": website,
        "latitude": geometry.get("y"),
        "longitude": geometry.get("x"),
        "collected_on": SOURCE_REFRESH_DATE,
        "provenance": "live",
    }


def normalize_fallback(record: dict) -> dict:
    result = dict(record)
    result["provenance"] = "workbook_snapshot"
    return result


def main():
    stable_ids = load_stable_ids()
    fallback = load_fallback()
    if not set(fallback).issubset(set(stable_ids)):
        raise RuntimeError("Workbook fallback contains an ID outside the frozen selection")

    features = []
    for offset in range(0, len(stable_ids), 200):
        features.extend(fetch_batch(stable_ids[offset:offset + 200]))
    live_by_id = {str((feature.get("attributes") or {}).get("ID_ETABLISSEMENT") or "").strip(): feature for feature in features}

    normalized = []
    unresolved = []
    fallback_reasons = []
    for stable_id in stable_ids:
        feature = live_by_id.get(stable_id)
        if feature is None:
            if stable_id in fallback:
                normalized.append(normalize_fallback(fallback[stable_id]))
                fallback_reasons.append((stable_id, "missing_live"))
            else:
                unresolved.append((stable_id, "missing_live"))
            continue
        try:
            normalized.append(normalize_live(stable_id, feature))
        except ValueError as exc:
            if stable_id in fallback:
                normalized.append(normalize_fallback(fallback[stable_id]))
                fallback_reasons.append((stable_id, str(exc)))
            else:
                unresolved.append((stable_id, str(exc)))

    if unresolved:
        details = ", ".join(f"{stable_id}({reason})" for stable_id, reason in unresolved)
        raise RuntimeError(f"Workbook snapshot fallback required for {len(unresolved)} additional REG IDs: {details}")

    base_counts = {}
    for record in normalized:
        base = slugify(record["name"])
        record["base_slug"] = base
        base_counts[base] = base_counts.get(base, 0) + 1

    rows, used_slugs = [], set()
    fallback_used = 0
    for record in normalized:
        stable_id = record["id_etablissement"]
        base = record["base_slug"]
        slug = base
        if base_counts[base] > 1 or slug in used_slugs:
            slug = f"{base}-{slugify(record['city'])}"
        if slug in used_slugs:
            slug = f"{slug}-{slugify(stable_id)}"
        if slug in used_slugs:
            raise RuntimeError(f"Unable to build a unique public listing slug for {stable_id}")
        used_slugs.add(slug)
        if record["provenance"] == "workbook_snapshot":
            fallback_used += 1
        rows.append("(" + ", ".join([
            sql_quote(SOURCE_LABEL), sql_quote(SOURCE_URL), sql_quote(stable_id), sql_quote(record["collected_on"]),
            sql_quote(record["name"]), sql_quote(record["category"]), sql_quote(record.get("activity_detail")),
            sql_quote(record["address"]), sql_quote(record.get("postal_code")), sql_quote(record["city"]),
            sql_quote(record.get("municipality")), sql_quote(record.get("phone")), sql_quote(record.get("website_url")),
            sql_quote(record.get("latitude")), sql_quote(record.get("longitude")), sql_quote(slug),
        ]) + ")")

    sql = """-- Generated from the exact user-provided REG/SITG workbook selection.
-- Stable ID_ETABLISSEMENT identifiers: {expected} source establishments.
-- {live_count} rows refreshed from live SITG on {refresh_date}; {fallback_count} rows preserved from the public workbook snapshot dated {selection_date} because live data was missing, out of the frozen restaurant/bar scope, or incomplete.
-- Only public professional fields needed by TOK are stored. No email, fax, IDE, secondary phone, photo or scraped contact is included.

insert into public.public_restaurant_listings (
  source, source_url, source_ref, source_collected_on, name, category, activity_detail,
  address, postal_code, city, municipality, phone, website_url, latitude, longitude, slug
)
values
{values}
on conflict (source, source_ref) do update
set source_url = excluded.source_url, source_collected_on = excluded.source_collected_on,
    name = excluded.name, category = excluded.category, activity_detail = excluded.activity_detail,
    address = excluded.address, postal_code = excluded.postal_code, city = excluded.city,
    municipality = excluded.municipality, phone = excluded.phone, website_url = excluded.website_url,
    latitude = excluded.latitude, longitude = excluded.longitude, slug = excluded.slug, updated_at = now()
where public.public_restaurant_listings.claim_status = 'unclaimed'
  and public.public_restaurant_listings.claimed_restaurant_id is null;

-- Keep every source row for provenance, but hide exact same-place duplicates from discovery.
update public.public_restaurant_listings set is_published = true, updated_at = now()
where source = '{source_label}' and claim_status <> 'claimed';

with ranked as (
  select id, row_number() over (
    partition by public.normalize_search_text(name), public.normalize_search_text(address), public.normalize_search_text(city)
    order by source_ref
  ) as rn
  from public.public_restaurant_listings
  where source = '{source_label}' and claim_status <> 'claimed'
)
update public.public_restaurant_listings as listing
set is_published = false, updated_at = now()
from ranked where ranked.id = listing.id and ranked.rn > 1;

-- Do not duplicate a restaurant that already has a live TOK profile.
update public.public_restaurant_listings as listing
set is_published = false, updated_at = now()
where listing.source = '{source_label}' and listing.claim_status <> 'claimed'
  and exists (
    select 1 from public.restaurants as restaurant
    where restaurant.is_active is true and restaurant.is_demo is false
      and lower(coalesce(restaurant.status, '')) = 'active'
      and public.normalize_search_text(restaurant.name) = public.normalize_search_text(listing.name)
      and public.normalize_search_text(restaurant.address) = public.normalize_search_text(listing.address)
  );

do $$
declare v_count integer;
begin
  select count(*) into v_count from public.public_restaurant_listings where source = '{source_label}';
  if v_count < {expected} then raise exception 'REG/SITG import incomplete: expected at least {expected} source rows, got %', v_count; end if;
end
$$;
""".format(
        expected=EXPECTED_COUNT,
        live_count=EXPECTED_COUNT - fallback_used,
        fallback_count=fallback_used,
        selection_date=SOURCE_SELECTION_DATE,
        refresh_date=SOURCE_REFRESH_DATE,
        values=",\n".join(rows),
        source_label=SOURCE_LABEL.replace("'", "''"),
    )
    OUTPUT_PATH.write_text(sql, encoding="utf-8")
    print(f"Generated {OUTPUT_PATH}: {EXPECTED_COUNT - fallback_used} live + {fallback_used} workbook snapshot rows")
    if fallback_reasons:
        print("Fallback provenance:", ", ".join(f"{stable_id}:{reason}" for stable_id, reason in fallback_reasons))


if __name__ == "__main__":
    main()
