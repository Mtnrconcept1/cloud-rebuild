#!/usr/bin/env python3
"""Generate the TOK public REG/SITG seed from the user-provided workbook selection.

The workbook snapshot is frozen by stable REG ID_ETABLISSEMENT values rather than
ArcGIS OBJECTID values, which can be reassigned between SITG dataset refreshes.
Only public professional fields required by TOK are requested from SITG.
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
OUTPUT_PATH = Path("supabase/migrations/20260829220500_seed_public_registry_restaurants.sql")

# zlib+base64 encoded comma-separated ID_ETABLISSEMENT values from the workbook.
# This freezes the exact 2,230 physical establishments without relying on mutable OBJECTIDs.
_STABLE_IDS_B64 = """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"""
STABLE_IDS = zlib.decompress(base64.b64decode(_STABLE_IDS_B64)).decode("utf-8").split(",")

OUT_FIELDS = ",".join([
    "ID_ETABLISSEMENT",
    "TYPE_REG",
    "NOM",
    "COMPLEMENT_LOCALI",
    "CODE_NOGA",
    "ACTIVITE_DETAIL",
    "TEL_PRINCIPAL",
    "SITE_INTERNET",
    "ADRESSE",
    "PHYS_NPA",
    "PHYS_LOCALITE",
    "PHYS_COMMUNE",
])


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
    value = re.sub(r"[^a-z0-9]+", "-", value).strip("-")
    return value or "restaurant"


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


def main():
    if len(STABLE_IDS) != EXPECTED_COUNT or len(set(STABLE_IDS)) != EXPECTED_COUNT:
        raise RuntimeError("The frozen workbook selection must contain exactly 2230 unique stable REG IDs")

    features = []
    for offset in range(0, len(STABLE_IDS), 200):
        features.extend(fetch_batch(STABLE_IDS[offset:offset + 200]))

    by_id = {
        str((feature.get("attributes") or {}).get("ID_ETABLISSEMENT") or "").strip(): feature
        for feature in features
    }
    missing = sorted(set(STABLE_IDS) - set(by_id))
    if missing:
        raise RuntimeError(f"SITG no longer returns {len(missing)} selected stable REG IDs: {missing[:20]}")

    staged = []
    base_counts = {}
    for stable_id in STABLE_IDS:
        feature = by_id[stable_id]
        attrs = feature.get("attributes") or {}
        geometry = feature.get("geometry") or {}
        type_reg = str(attrs.get("TYPE_REG") or "").strip()
        code_noga = str(attrs.get("CODE_NOGA") or "").strip()
        if type_reg != "Etablissement" or code_noga not in ALLOWED_NOGA:
            raise RuntimeError(
                f"Stable REG ID {stable_id} changed outside the selected physical restaurant/bar scope"
            )
        name = str(attrs.get("NOM") or "").strip()
        address = str(attrs.get("ADRESSE") or "").strip()
        city = str(attrs.get("PHYS_LOCALITE") or attrs.get("PHYS_COMMUNE") or "").strip()
        if not name or not address or not city:
            raise RuntimeError(f"Stable REG ID {stable_id} is missing a required public location field")
        complement = str(attrs.get("COMPLEMENT_LOCALI") or "").strip()
        display_address = f"{address} — {complement}" if complement else address
        category = "Bar" if code_noga in {"563001", "563002"} else "Restaurant/cafe/snack/tea-room"
        base = slugify(name)
        base_counts[base] = base_counts.get(base, 0) + 1
        staged.append((stable_id, attrs, geometry, name, display_address, city, category, base))

    rows = []
    used_slugs = set()
    for stable_id, attrs, geometry, name, display_address, city, category, base in staged:
        slug = base
        if base_counts[base] > 1 or slug in used_slugs:
            slug = f"{base}-{slugify(city)}"
        complement = str(attrs.get("COMPLEMENT_LOCALI") or "").strip()
        if slug in used_slugs and complement:
            slug = f"{slug}-{slugify(complement)}"
        if slug in used_slugs:
            slug = f"{slug}-{slugify(stable_id)}"
        if slug in used_slugs:
            raise RuntimeError(f"Unable to build a unique public listing slug for {stable_id}")
        used_slugs.add(slug)

        website = str(attrs.get("SITE_INTERNET") or "").strip() or None
        if website and not re.match(r"^https?://", website, re.I):
            website = None
        phone = str(attrs.get("TEL_PRINCIPAL") or "").strip() or None
        activity = str(attrs.get("ACTIVITE_DETAIL") or "").strip() or None
        rows.append("(" + ", ".join([
            sql_quote(SOURCE_LABEL),
            sql_quote(SOURCE_URL),
            sql_quote(stable_id),
            sql_quote(SOURCE_REFRESH_DATE),
            sql_quote(name),
            sql_quote(category),
            sql_quote(activity),
            sql_quote(display_address),
            sql_quote(str(attrs.get("PHYS_NPA") or "").strip() or None),
            sql_quote(city),
            sql_quote(str(attrs.get("PHYS_COMMUNE") or "").strip() or None),
            sql_quote(phone),
            sql_quote(website),
            sql_quote(geometry.get("y")),
            sql_quote(geometry.get("x")),
            sql_quote(slug),
        ]) + ")")

    sql = """-- Generated from the exact user-provided REG/SITG workbook selection.
-- Original selection date: {selection_date}. Public-source refresh used for this seed: {refresh_date}.
-- Only public professional fields needed by TOK are stored. No email, photo or scraped contact is included.

insert into public.public_restaurant_listings (
  source, source_url, source_ref, source_collected_on, name, category, activity_detail,
  address, postal_code, city, municipality, phone, website_url, latitude, longitude, slug
)
values
{values}
on conflict (source, source_ref) do update
set
  source_url = excluded.source_url,
  source_collected_on = excluded.source_collected_on,
  name = excluded.name,
  category = excluded.category,
  activity_detail = excluded.activity_detail,
  address = excluded.address,
  postal_code = excluded.postal_code,
  city = excluded.city,
  municipality = excluded.municipality,
  phone = excluded.phone,
  website_url = excluded.website_url,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  slug = excluded.slug,
  updated_at = now()
where public.public_restaurant_listings.claim_status = 'unclaimed'
  and public.public_restaurant_listings.claimed_restaurant_id is null;

-- Keep every source row for provenance, but hide exact same-place duplicates from discovery.
update public.public_restaurant_listings
set is_published = true,
    updated_at = now()
where source = '{source_label}'
  and claim_status <> 'claimed';

with ranked as (
  select id,
         row_number() over (
           partition by public.normalize_search_text(name),
                        public.normalize_search_text(address),
                        public.normalize_search_text(city)
           order by source_ref
         ) as rn
  from public.public_restaurant_listings
  where source = '{source_label}'
    and claim_status <> 'claimed'
)
update public.public_restaurant_listings as listing
set is_published = false,
    updated_at = now()
from ranked
where ranked.id = listing.id
  and ranked.rn > 1;

-- Do not duplicate a restaurant that already has a live TOK profile.
update public.public_restaurant_listings as listing
set is_published = false,
    updated_at = now()
where listing.source = '{source_label}'
  and listing.claim_status <> 'claimed'
  and exists (
    select 1
    from public.restaurants as restaurant
    where restaurant.is_active is true
      and restaurant.is_demo is false
      and lower(coalesce(restaurant.status, '')) = 'active'
      and public.normalize_search_text(restaurant.name) = public.normalize_search_text(listing.name)
      and public.normalize_search_text(restaurant.address) = public.normalize_search_text(listing.address)
  );

do $$
declare v_count integer;
begin
  select count(*) into v_count
  from public.public_restaurant_listings
  where source = '{source_label}';
  if v_count < {expected} then
    raise exception 'REG/SITG import incomplete: expected at least {expected} source rows, got %', v_count;
  end if;
end
$$;
""".format(
        selection_date=SOURCE_SELECTION_DATE,
        refresh_date=SOURCE_REFRESH_DATE,
        values=",\n".join(rows),
        source_label=SOURCE_LABEL.replace("'", "''"),
        expected=EXPECTED_COUNT,
    )

    OUTPUT_PATH.write_text(sql, encoding="utf-8")
    print(f"Generated {OUTPUT_PATH} with {len(rows)} stable public listings")


if __name__ == "__main__":
    main()
