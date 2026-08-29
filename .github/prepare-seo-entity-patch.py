#!/usr/bin/env python3
from pathlib import Path
import runpy

ROOT = Path(__file__).resolve().parents[1]
patch_path = ROOT / ".github/seo-entity-patch.py"
source = patch_path.read_text(encoding="utf-8")
old = "updated, count = re.subn(pattern, replacement, text, count=1, flags=re.DOTALL)"
new = "updated, count = re.subn(pattern, lambda _match: replacement, text, count=1, flags=re.DOTALL)"
if source.count(old) != 1:
    raise RuntimeError("Unexpected patch helper")
patch_path.write_text(source.replace(old, new, 1), encoding="utf-8")
runpy.run_path(str(patch_path), run_name="__main__")
entity_path = ROOT / "src/lib/seo/restaurantEntity.mjs"
lines = entity_path.read_text(encoding="utf-8").splitlines()
for line_number in (205, 214, 218, 226, 480):
    print(f"ENTITY_LINE_{line_number}={lines[line_number - 1]!r}")
raise RuntimeError("Diagnostic complete")
