# Geneva Demo Restaurants Design

## Goal

Complete the Geneva demo catalog with 15 Geneva restaurants that are usable across the app, not just listed in the database.

Each restaurant must have:

- restaurant profile data
- opening hours with reservation service settings
- a visible menu
- meal formulas
- one Chef's Table drop
- one flash sale
- one anti-waste offer
- product images that match the product as closely as possible using local assets

## Scope

This design targets the 15 Geneva restaurants already introduced by the existing seed migration. The implementation should enrich and normalize that dataset instead of creating 15 extra duplicates.

The work will be delivered as a new idempotent migration that:

1. inserts missing restaurants or updates existing seeded ones
2. normalizes restaurant metadata and service settings
3. creates or refreshes menus, formulas, flash sales, anti-waste offers, and Chef's Table drops
4. switches seeded product imagery to local `/images/...` assets

## Data Strategy

### Restaurant identity

Restaurants will be matched primarily by phone number. This is more stable than matching names because the old seed contains mojibake text in some names and descriptions.

### Menu strategy

For seeded Geneva restaurants, the migration will:

- mark existing menu items for those restaurants as unavailable
- upsert a curated target menu per restaurant
- keep target menu items available and image-backed

This avoids breaking existing references while ensuring the customer-facing menu is clean and coherent.

### Formula strategy

Each restaurant gets 3 standard formulas:

- `entree_plat`
- `plat_dessert`
- `entree_plat_dessert`

Categories will use formula-compatible labels such as `Entrees`, `Plats`, and `Desserts` so the detection logic works in reservation and zero-wait flows.

### Offers strategy

Each restaurant gets:

- 1 flash sale active on `current_date` with an all-day visibility window
- 1 anti-waste offer active on `current_date` with a late pickup window
- 1 active Chef's Table drop with portions and a near-term `drop_time`

Titles are deterministic so the migration can update existing seeded offers instead of duplicating them.

## Opening Hours

`opening_hours` will preserve any unrelated keys already present and inject a `service_settings` object for lunch and dinner.

Default target:

- lunch: `12:00` to `14:30`, last reservation `14:00`
- dinner: `19:00` to `22:30`, last reservation `22:00`
- reservation party size and cover limits enabled for customer booking

Restaurants will also expose dine-in, pickup, reservation, and scheduled ordering capabilities.

## Image Policy

Priority order:

1. exact local product image already available in `public/images`
2. local same-product-family image
3. local same-cuisine spread image when no exact dish image exists

External image URLs should not be introduced for the seeded products. If some existing filenames are hard to reference reliably because of accents or encoding artifacts, local ASCII aliases may be created in `public/images`.

## Verification

Validation after implementation should cover:

- migration SQL parses cleanly
- all seeded product image paths resolve to local files
- all 15 restaurants have formulas, flash sales, anti-waste offers, and Chef's Table drops
- the target menu items are customer-visible (`is_available = true`)

## Constraints And Risks

- Supabase CLI is not available in this environment, so the migration file will be created manually.
- Git is currently blocked by a safe-directory ownership issue, so the design doc cannot be committed from this session without changing global git config.
