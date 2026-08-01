from pathlib import Path

path = Path("scripts/apply-incident-intelligence-unification.mjs")
source = path.read_text(encoding="utf-8")


def is_escaped(value: str, index: int) -> bool:
    backslashes = 0
    cursor = index - 1
    while cursor >= 0 and value[cursor] == "\\":
        backslashes += 1
        cursor -= 1
    return backslashes % 2 == 1


def escape_nested_backticks(line: str) -> str:
    stripped = line.lstrip()
    if not stripped.startswith("`") or not line.rstrip().endswith("`,"):
        return line

    positions = [
        index
        for index, character in enumerate(line)
        if character == "`" and not is_escaped(line, index)
    ]
    if len(positions) < 2:
        return line

    outer_start = positions[0]
    outer_end = positions[-1]
    nested = set(positions[1:-1])
    if not nested:
        return line

    output: list[str] = []
    for index, character in enumerate(line):
        if index in nested:
            output.append("\\")
        output.append(character)

    repaired = "".join(output)
    repaired_positions = [
        index
        for index, character in enumerate(repaired)
        if character == "`" and not is_escaped(repaired, index)
    ]
    if len(repaired_positions) != 2:
        raise SystemExit(
            f"Template payload still has {len(repaired_positions)} unescaped backticks: "
            f"{line[:120]!r}"
        )
    if outer_start != repaired_positions[0]:
        raise SystemExit("Outer template start changed unexpectedly")
    return repaired


lines = source.splitlines(keepends=True)
repaired_lines = [escape_nested_backticks(line) for line in lines]
repaired = "".join(repaired_lines)

if repaired == source:
    raise SystemExit("No nested template literals were found to repair")

path.write_text(repaired, encoding="utf-8")
print("All nested template literals escaped for the one-shot patcher.")
