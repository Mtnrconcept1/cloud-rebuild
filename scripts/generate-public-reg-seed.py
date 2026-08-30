#!/usr/bin/env python3
"""Generate the TOK public REG/SITG seed from the frozen workbook selection.

The source selection is stored as stable public REG ID_ETABLISSEMENT values in
scripts/public-reg-ids/*.txt. ArcGIS OBJECTID values are intentionally not used
because they may be reassigned between SITG dataset refreshes.

Only the public professional fields needed by TOK are requested. The generator
never requests email, fax, company size, IDE, secondary phones or photos.
"""

from __future__ import annotations

import json
import math
import re
import unicodedata
import urllib.parse
import urllib.request
from pathlib import Path

SOURCE_LABEL = "REG/SITG – Répertoire des entreprises et établissements"
SOURCE_URL = "https://sitg.ge.ch/donnees/reg-entreprise-etablissement"
ARCGIS_QUERY_URL = "https://vector.sitg.ge.ch/arcgis/rest/services/REG_ENTREPRISE_ETABLISSEMENT/FeatureServer/0/query"
SOURCE_SELECTION_DATE = "2026-05-26"
SOURCE_REFRESH_DATE = "2026-08-30"
EXPECTED_COUNT = 2230
ALLOWED_NOGA = {"561001", "561003", "563001", "563002"}
ID_DIRECTORY = Path("scripts/public-reg-ids")
OUTPUT_PATH = Path("supabase/migrations/20260829220500_seed_public_registry_restaurants.sql")

OUT_FIELDS = ",".join([
    "ID_ETABLISSEMENT", "TYPE_REG", "NOM", "COMPLEMENT_LOCALI", "CODE_NOGA",
    "ACTIVITE_DETAIL", "TEL_PRINCIPAL", "SITE_INTERNET", "ADRESSE", "PHYS_NPA",
    "PHYS_LOCALITE", "PHYS_COMMUNE",
])


def load_stable_ids() -> list[str]:
    paths = sorted(ID_DIRECTORY.glob("*.txt"))
    if not paths:
        raise RuntimeError(f"No stable REG ID files found in {ID_DIRECTORY}")
    stable_ids: list[str] = []
    for path in paths:
        stable_ids.extend(line.strip() for line in path.read_text(encoding="utf-8").splitlines() if line.strip())
    if len(stable_ids) != EXPECTED_COUNT:
        raise RuntimeError(f"Frozen workbook selection must contain exactly {EXPECTED_COUNT} stable REG IDs, got {len(stable_ids)}")
    if len(set(stable_ids)) != EXPECTED_COUNT:
        raise RuntimeError("Frozen workbook selection contains duplicate stable REG IDs")
    if any(not re.fullmatch(r"[A-Za-z0-9-]+", value) for value in stable_ids):
        raise RuntimeError("Frozen workbook selection contains an invalid REG establishment ID")
    return stable_ids


def sql_quote(value):
    if value is None or value == "": return "NULL"
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if isinstance(value, float) and (math.isnan(value) or math.isinf(value)): return "NULL"
        return repr(value)
    return "'" + str(value).replace("'", "''") + "'"


def slugify(value):
    value = unicodedata.normalize("NFKD", str(value or ""))
    value = "".join(char for char in value if not unicodedata.combining(char)).lower()
    return re.sub(r"[^a-z0-9]+", "-", value).strip("-") or "restaurant"


def fetch_batch(stable_ids):
    quoted = ",".join("'" + value.replace("'", "''") + "'" for value in stable_ids)
    form = urllib.parse.urlencode({"where": f"ID_ETABLISSEMENT IN ({quoted})", "outFields": OUT_FIELDS, "returnGeometry": "true", "outSR": "4326", "f": "json"}).encode("utf-8")
    request = urllib.request.Request(ARCGIS_QUERY_URL, data=form, method="POST")
    with urllib.request.urlopen(request, timeout=60) as response: payload = json.load(response)
    if payload.get("error"): raise RuntimeError(f"ArcGIS error: {payload['error']}")
    return payload.get("features", [])


def main():
    stable_ids = load_stable_ids()
    features = []
    for offset in range(0, len(stable_ids), 200): features.extend(fetch_batch(stable_ids[offset:offset + 200]))
    by_id = {str((feature.get("attributes") or {}).get("ID_ETABLISSEMENT") or "").strip(): feature for feature in features}
    missing = sorted(set(stable_ids) - set(by_id))
    if missing:
        raise RuntimeError(f"SITG no longer returns {len(missing)} selected stable REG IDs: {missing}")

    staged, base_counts = [], {}
    for stable_id in stable_ids:
        feature = by_id[stable_id]; attrs = feature.get("attributes") or {}; geometry = feature.get("geometry") or {}
        type_reg = str(attrs.get("TYPE_REG") or "").strip(); code_noga = str(attrs.get("CODE_NOGA") or "").strip()
        if type_reg != "Etablissement" or code_noga not in ALLOWED_NOGA: raise RuntimeError(f"Stable REG ID {stable_id} changed outside the selected physical restaurant/bar scope")
        name = str(attrs.get("NOM") or "").strip(); address = str(attrs.get("ADRESSE") or "").strip(); city = str(attrs.get("PHYS_LOCALITE") or attrs.get("PHYS_COMMUNE") or "").strip()
        if not name or not address or not city: raise RuntimeError(f"Stable REG ID {stable_id} is missing a required public location field")
        complement = str(attrs.get("COMPLEMENT_LOCALI") or "").strip(); display_address = f"{address} — {complement}" if complement else address
        category = "Bar" if code_noga in {"563001", "563002"} else "Restaurant/cafe/snack/tea-room"; base = slugify(name)
        base_counts[base] = base_counts.get(base, 0) + 1; staged.append((stable_id, attrs, geometry, name, display_address, city, category, base))

    rows, used_slugs = [], set()
    for stable_id, attrs, geometry, name, display_address, city, category, base in staged:
        slug = base
        if base_counts[base] > 1 or slug in used_slugs: slug = f"{base}-{slugify(city)}"
        complement = str(attrs.get("COMPLEMENT_LOCALI") or "").strip()
        if slug in used_slugs and complement: slug = f"{slug}-{slugify(complement)}"
        if slug in used_slugs: slug = f"{slug}-{slugify(stable_id)}"
        if slug in used_slugs: raise RuntimeError(f"Unable to build a unique public listing slug for {stable_id}")
        used_slugs.add(slug)
        website = str(attrs.get("SITE_INTERNET") or "").strip() or None
        if website and not re.match(r"^https?://", website, re.I): website = None
        phone = str(attrs.get("TEL_PRINCIPAL") or "").strip() or None; activity = str(attrs.get("ACTIVITE_DETAIL") or "").strip() or None
        rows.append("(" + ", ".join([sql_quote(SOURCE_LABEL), sql_quote(SOURCE_URL), sql_quote(stable_id), sql_quote(SOURCE_REFRESH_DATE), sql_quote(name), sql_quote(category), sql_quote(activity), sql_quote(display_address), sql_quote(str(attrs.get("PHYS_NPA") or "").strip() or None), sql_quote(city), sql_quote(str(attrs.get("PHYS_COMMUNE") or "").strip() or None), sql_quote(phone), sql_quote(website), sql_quote(geometry.get("y")), sql_quote(geometry.get("x")), sql_quote(slug)]) + ")")

    sql = """-- Generated from the exact user-provided REG/SITG workbook selection.
-- Stable ID_ETABLISSEMENT identifiers: {expected} source establishments.
-- Original selection date: {selection_date}. Public-source refresh used for this seed: {refresh_date}.
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
""".format(expected=EXPECTED_COUNT, selection_date=SOURCE_SELECTION_DATE, refresh_date=SOURCE_REFRESH_DATE, values=",\n".join(rows), source_label=SOURCE_LABEL.replace("'", "''"))
    OUTPUT_PATH.write_text(sql, encoding="utf-8")
    print(f"Generated {OUTPUT_PATH} with {len(rows)} stable public listings")


if __name__ == "__main__": main()
