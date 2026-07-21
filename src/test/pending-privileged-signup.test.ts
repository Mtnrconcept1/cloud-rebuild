import { describe, expect, it } from "vitest";

import { createPendingPrivilegedSignupDraft } from "@/lib/pendingPrivilegedSignup";

describe("pending privileged signup draft", () => {
  it("binds the temporary dossier to one confirmed account and expires it", () => {
    const draft = createPendingPrivilegedSignupDraft({
      id: "operation-123",
      userId: "user-123",
      email: "  RESTAURANT@Example.COM ",
      now: new Date("2026-07-21T10:00:00.000Z"),
      ttlMs: 60_000,
      payload: { role: "restaurateur" },
    });

    expect(draft).toEqual({
      id: "operation-123",
      userId: "user-123",
      email: "restaurant@example.com",
      createdAt: "2026-07-21T10:00:00.000Z",
      expiresAt: "2026-07-21T10:01:00.000Z",
      payload: { role: "restaurateur" },
    });
  });
});
