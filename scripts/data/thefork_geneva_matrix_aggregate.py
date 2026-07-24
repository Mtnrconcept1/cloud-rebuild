from __future__ import annotations

import csv
import json
import re
from collections import Counter
from pathlib import Path

INPUT_DIR = Path("artifacts/thefork-geneva-matrix/raw")
OUTPUT_DIR = Path("artifacts/thefork-geneva-matrix-result")


def infer_name(slug_id: str) -> str:
    slug = re.sub(r"-r\d+$", "", slug_id)
    return " ".join(token.capitalize() for token in slug.split("-") if token)


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    records: dict[str, dict[str, object]] = {}
    stats = Counter()
    input_files = sorted(INPUT_DIR.rglob("*.json"))

    for path in input_files:
        payload = json.loads(path.read_text(encoding="utf-8"))
        stats[f"brave_status_{payload.get('brave', {}).get('status')}"] += 1
        stats[f"bing_status_{payload.get('bing', {}).get('status')}"] += 1
        for incoming in payload.get("records", []):
            rid = str(incoming["restaurant_id"])
            record = records.setdefault(rid, {
                "restaurant_id": rid,
                "restaurant_name_inferred": infer_name(str(incoming["slug_id"])),
                "slug_id": incoming["slug_id"],
                "url_thefork": incoming["url_thefork"],
                "samples": [],
                "queries": [],
                "engines": [],
                "matrix_ids": [],
            })
            for sample in incoming.get("samples", []):
                if sample not in record["samples"] and len(record["samples"]) < 20:
                    record["samples"].append(sample)
            query = payload.get("query")
            if query and query not in record["queries"]:
                record["queries"].append(query)
            for engine in incoming.get("engines", []):
                if engine not in record["engines"]:
                    record["engines"].append(engine)
            matrix_id = str(payload.get("id", ""))
            if matrix_id and matrix_id not in record["matrix_ids"]:
                record["matrix_ids"].append(matrix_id)

    rows = sorted(records.values(), key=lambda row: (str(row["restaurant_name_inferred"]), int(str(row["restaurant_id"]))))
    (OUTPUT_DIR / "thefork_geneva_matrix_hits.json").write_text(
        json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    with (OUTPUT_DIR / "thefork_geneva_matrix_hits.csv").open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=[
            "restaurant_id", "restaurant_name_inferred", "slug_id", "url_thefork",
            "samples", "queries", "engines", "matrix_ids",
        ], delimiter=";")
        writer.writeheader()
        for row in rows:
            writer.writerow({
                **row,
                "samples": json.dumps(row["samples"], ensure_ascii=False),
                "queries": json.dumps(row["queries"], ensure_ascii=False),
                "engines": json.dumps(row["engines"], ensure_ascii=False),
                "matrix_ids": json.dumps(row["matrix_ids"], ensure_ascii=False),
            })

    summary = {
        "input_files": len(input_files),
        "unique_restaurants": len(rows),
        "statuses": dict(stats),
    }
    (OUTPUT_DIR / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == "__main__":
    main()
