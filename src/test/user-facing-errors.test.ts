import { describe, expect, it } from "vitest";

import { getUserFacingErrorMessage } from "@/lib/userFacingErrors";

describe("user-facing error messages", () => {
  it("hides Supabase RLS and table details from public toasts", () => {
    expect(
      getUserFacingErrorMessage('new row violates row-level security policy for table "social_post_comments"'),
    ).toBe("Nous n'avons pas pu finaliser cette action. Veuillez réessayer dans quelques instants.");
  });

  it("keeps already understandable product messages", () => {
    expect(getUserFacingErrorMessage("Le commentaire est vide.")).toBe("Le commentaire est vide.");
  });

  it("normalizes expired sessions without exposing token details", () => {
    expect(getUserFacingErrorMessage("JWT refresh token expired for user session")).toBe(
      "Veuillez vous connecter pour continuer.",
    );
  });
});
