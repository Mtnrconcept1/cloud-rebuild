from __future__ import annotations

import json
import os
from pathlib import Path


def main() -> None:
    candidate_path = Path(os.environ.get("TF_CANDIDATE_JSON", "input/thefork_geneva_matrix_hits.json"))
    candidates = json.loads(candidate_path.read_text(encoding="utf-8"))
    requested = int(os.environ.get("TF_EMAIL_SHARDS", "128"))
    shard_count = max(1, min(requested, len(candidates)))
    matrix = {
        "include": [
            {"shard": f"{index:03d}", "shard_index": index, "shard_count": shard_count}
            for index in range(shard_count)
        ]
    }
    Path("email-matrix.json").write_text(
        json.dumps(matrix, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(json.dumps({"candidates": len(candidates), "shards": shard_count}, ensure_ascii=False))


if __name__ == "__main__":
    main()
