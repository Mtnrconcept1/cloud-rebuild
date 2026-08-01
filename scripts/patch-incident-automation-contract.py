from pathlib import Path
import re

path = Path("src/test/incident-automation-readiness.test.ts")
source = path.read_text(encoding="utf-8")

old_marker = '      \'selectTokAiModel("admin_monitor", complexity)\',\n'
new_marker = '      \'selectTokAiModel("incident_triage")\',\n'
if source.count(old_marker) != 1:
    raise SystemExit("Expected the legacy admin-monitor marker exactly once")
source = source.replace(old_marker, new_marker, 1)

pattern = re.compile(
    r'  it\("routes complex diagnostics to the strategic model independently from Codex repair", \(\) => \{[\s\S]*?\n  \}\);\n\n  it\("isolates Codex, validation, and publication on separate runners"',
)
replacement = r'''  it("routes technical triage economically and independently from Codex repair", () => {
    const edgeFunction = readProjectFile(
      "supabase/functions/ops-incident-control/index.ts",
    );
    const sharedOpenAi = readProjectFile("supabase/functions/_shared/openai.ts");
    const selector = extractNamedFunction(sharedOpenAi, "selectTokAiModel");

    expect(edgeFunction).toContain('selectTokAiModel("incident_triage")');
    expect(edgeFunction).toContain("INCIDENT_TRIAGE_OUTPUT_TOKENS = 900");
    expect(edgeFunction).toContain('reasoning: { effort: "low" }');
    expect(edgeFunction).toContain('verbosity: "low"');
    expect(edgeFunction).toContain("classifyIncidentRepairability");
    expect(edgeFunction).toContain("codex_eligible");
    expect(selector).toMatch(
      /case "incident_triage":\s+return TOK_AI_INCIDENT_TRIAGE_MODEL;/,
    );
    expect(selector).toMatch(
      /case "incident_deep":\s+return TOK_AI_INCIDENT_DEEP_MODEL;/,
    );
    expect(edgeFunction).toContain('const CODEX_REPAIR_MODEL = "gpt-5.6-sol"');
    expect(edgeFunction).toContain('const CODEX_REPAIR_EFFORT = "high"');
  });

  it("isolates Codex, validation, and publication on separate runners"'''
source, count = pattern.subn(lambda _match: replacement, source, count=1)
if count != 1:
    raise SystemExit(f"Expected one legacy routing test block, replaced {count}")

path.write_text(source, encoding="utf-8")
print("Incident automation contract aligned with canonical triage routing.")
