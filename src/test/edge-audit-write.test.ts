import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Execute the real module with only its remote Supabase import substituted.
// No client or network is needed to exercise the audit write contract.
const source = readFileSync(resolve("supabase/functions/_shared/auth.ts"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const fallback = vi.fn();
const exports: Record<string, any> = {};
runInNewContext(compiled, {
  exports, URL, console: { error: fallback },
  require: (name: string) => {
    if (name !== "https://esm.sh/@supabase/supabase-js@2") throw new Error(`Unexpected import: ${name}`);
    return { createClient: () => { throw new Error("No audit test may create a remote client"); } };
  },
});

describe("Edge audit write failure handling", () => {
  beforeEach(() => fallback.mockReset());

  function input(insert: ReturnType<typeof vi.fn>, functionName = "print-orchestrator") {
    return {
      adminClient: { from: vi.fn().mockReturnValue({ insert }) },
      functionName, status: "success", action: "secret-action",
      actor: { userId: "private-user", roles: ["admin"] },
      request: new Request("https://example.test/private/path?token=private-token"),
      metadata: { private_data: "sensitive-payload" },
    };
  }

  it("preserves a successful audit and emits no fallback signal", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const audit = input(insert);
    await expect(exports.writeAuditLog(audit)).resolves.toBeUndefined();
    expect(audit.adminClient.from).toHaveBeenCalledWith("edge_function_audit_logs");
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      function_name: "print-orchestrator", actor_user_id: "private-user", status: "success",
    }));
    expect(fallback).not.toHaveBeenCalled();
  });

  it.each([false, true])("reports SDK or thrown database errors without interrupting the operation (throw=%s)", async (throws) => {
    const error = { code: "42501", message: "secret database detail", details: "sensitive-payload" };
    const insert = throws ? vi.fn().mockRejectedValue(error) : vi.fn().mockResolvedValue({ error });
    await expect(exports.writeAuditLog(input(insert))).resolves.toBeUndefined();
    expect(insert).toHaveBeenCalledOnce();
    expect(fallback).toHaveBeenCalledExactlyOnceWith("[audit] audit_write_failed", {
      event: "audit_write_failed", function_name: "print-orchestrator", code: "42501",
    });
    expect(JSON.stringify(fallback.mock.calls)).not.toMatch(/secret|private|sensitive|database detail/);
  });

  it.each(["PGRST116", "XX000"])("preserves a bounded diagnostic code %s", async (code) => {
    await exports.writeAuditLog(input(vi.fn().mockResolvedValue({ error: { code } })));
    expect(fallback.mock.calls[0][1].code).toBe(code);
  });

  it.each([undefined, null, 42, "secret-value", "42501\nprivate", "x".repeat(1000)])("redacts untrusted error codes and function names (%s)", async (code) => {
    await expect(exports.writeAuditLog(input(
      vi.fn().mockResolvedValue({ error: { code, message: "secret" } }), "private/path?token=secret",
    ))).resolves.toBeUndefined();
    expect(fallback).toHaveBeenCalledExactlyOnceWith("[audit] audit_write_failed", {
      event: "audit_write_failed", function_name: "unknown", code: "unknown",
    });
  });
});
