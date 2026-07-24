from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any

INPUT_DIR = Path("artifacts/thefork-geneva-email-raw")
OUTPUT_DIR = Path("artifacts/thefork-geneva-email-result")


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    rows: list[dict[str, Any]] = []
    input_files = sorted(INPUT_DIR.rglob("*.json"))
    for path in input_files:
        payload = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(payload, list):
            rows.extend(payload)

    deduped: dict[str, dict[str, Any]] = {}
    for row in rows:
        restaurant_id = str(row.get("restaurant_id", ""))
        if not restaurant_id:
            continue
        previous = deduped.get(restaurant_id)
        if previous is None or (not previous.get("email") and row.get("email")):
            deduped[restaurant_id] = row

    final_rows = sorted(
        deduped.values(),
        key=lambda row: (str(row.get("restaurant_name_inferred", "")).lower(), int(str(row.get("restaurant_id", "0")))),
    )
    json_path = OUTPUT_DIR / "thefork_geneva_public_email_enrichment.json"
    json_path.write_text(json.dumps(final_rows, ensure_ascii=False, indent=2), encoding="utf-8")

    columns = [
        "restaurant_id", "restaurant_name_inferred", "city_hint", "email", "email_status",
        "email_confidence", "email_source_url", "email_source_type", "telephone", "site_web",
        "address_text_web", "latitude", "longitude", "url_thefork", "search_query",
        "email_candidates", "searched_urls",
    ]
    csv_path = OUTPUT_DIR / "thefork_geneva_public_email_enrichment.csv"
    with csv_path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns, delimiter=";")
        writer.writeheader()
        for row in final_rows:
            writer.writerow({
                **{column: row.get(column, "") for column in columns},
                "email_candidates": json.dumps(row.get("email_candidates", []), ensure_ascii=False),
                "searched_urls": json.dumps(row.get("searched_urls", []), ensure_ascii=False),
            })

    summary = {
        "input_files": len(input_files),
        "restaurants": len(final_rows),
        "public_verified_emails": sum(row.get("email_status") == "public_verified" for row in final_rows),
        "public_candidate_emails": sum(row.get("email_status") == "public_candidate" for row in final_rows),
        "email_not_found_publicly": sum(not row.get("email") for row in final_rows),
        "websites": sum(bool(row.get("site_web")) for row in final_rows),
        "phones": sum(bool(row.get("telephone")) for row in final_rows),
    }
    (OUTPUT_DIR / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == "__main__":
    main()
