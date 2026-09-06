#!/usr/bin/env python3
from pathlib import Path

path = Path("scripts/pr640-implement.py")
source = path.read_text(encoding="utf-8")
old = '''def replace_once(path: str, before: str, after: str) -> None:\n    file_path = Path(path)\n    source = file_path.read_text(encoding="utf-8")\n    before_text = block(before)\n    after_text = block(after)\n    if before_text not in source:\n        raise SystemExit(f"Expected source block not found in {path}: {before_text[:140]!r}")\n    file_path.write_text(source.replace(before_text, after_text, 1), encoding="utf-8")\n'''
new = '''def replace_once(path: str, before: str, after: str) -> None:\n    import re\n\n    file_path = Path(path)\n    source = file_path.read_text(encoding="utf-8")\n    before_text = block(before)\n    after_text = block(after)\n    if before_text in source:\n        file_path.write_text(source.replace(before_text, after_text, 1), encoding="utf-8")\n        return\n\n    lines = before_text.splitlines()\n    pattern_lines = []\n    for line in lines:\n        stripped = line.strip()\n        if stripped:\n            pattern_lines.append(r"^[ \\t]*" + re.escape(stripped) + r"[ \\t]*$")\n        else:\n            pattern_lines.append(r"^[ \\t]*$")\n    match = re.search("\\n".join(pattern_lines), source, flags=re.MULTILINE)\n    if not match:\n        raise SystemExit(f"Expected source block not found in {path}: {before_text[:140]!r}")\n\n    first_line = match.group(0).splitlines()[0]\n    base_indent = re.match(r"^[ \\t]*", first_line).group(0)\n    replacement = "\\n".join(\n        (base_indent + line if line else "")\n        for line in after_text.splitlines()\n    )\n    file_path.write_text(source[:match.start()] + replacement + source[match.end():], encoding="utf-8")\n'''
if old not in source:
    raise SystemExit("replace_once definition not found")
source = source.replace(old, new, 1)
source = source.replace('"gpt-5.6-terra": { input: 2.5, output: 15 },', '"gpt-5.6-terra": { input: 2, output: 12 },')
source = source.replace('"gpt-5.6-luna": { input: 1, output: 6 },', '"gpt-5.6-luna": { input: 0.2, output: 1.2 },')
path.write_text(source, encoding="utf-8")

test_path = Path("src/test/notifications-ai-admin-hardening.test.ts")
test_source = test_path.read_text(encoding="utf-8")
for old_assertion, new_assertion in [
    ('expect(pushWorker).toContain(\'rpc("claim_notification_deliveries"\');', 'expect(pushWorker).toContain("claim_notification_deliveries");'),
    ('expect(pushWorker).toContain(\'rpc("settle_notification_delivery"\');', 'expect(pushWorker).toContain("settle_notification_delivery");'),
    ('expect(emailWorker).toContain(\'rpc("claim_notification_deliveries"\');', 'expect(emailWorker).toContain("claim_notification_deliveries");'),
    ('expect(emailWorker).toContain(\'rpc("settle_notification_delivery"\');', 'expect(emailWorker).toContain("settle_notification_delivery");'),
]:
    if old_assertion not in test_source:
        raise SystemExit(f"Expected test assertion not found: {old_assertion}")
    test_source = test_source.replace(old_assertion, new_assertion, 1)
test_path.write_text(test_source, encoding="utf-8")

print("Updated PR 640 patch matcher, pricing and source contracts")
