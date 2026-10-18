import { describe, expect, it } from "vitest";
import {
  workforceInvitationEmail, workforceInvitationNotice, workforceInvitationState, workforceZurichClock,
  type WorkforceInvitation,
} from "@/lib/tokWorkforce";

const employee = { is_active: true, user_id: null };
const invitation: WorkforceInvitation = {
  invitation_id: "inv-1", employee_id: "employee-1", email: "alice@example.ch",
  invited_at: "2026-10-18T10:00:00Z", expires_at: "2026-10-25T10:00:00Z",
  accepted_at: null, revoked_at: null, delivery_status: "queued", provider_status: null, sent_at: null,
};
const now = new Date("2026-10-18T12:00:00Z");

describe("TOK Équipe — suivi de l’accès employé", () => {
  it("distingue un envoi programmé, un e-mail envoyé et un accès réellement activé", () => {
    expect(workforceInvitationState(employee, invitation, now)).toBe("queued");
    expect(workforceInvitationState(employee, { ...invitation, delivery_status: "processing" }, now)).toBe("processing");
    expect(workforceInvitationState(employee, { ...invitation, delivery_status: "sent" }, now)).toBe("sent");
    expect(workforceInvitationState({ ...employee, user_id: "user-1" }, invitation, now)).toBe("linked");
    expect(workforceInvitationState(employee, { ...invitation, accepted_at: now.toISOString() }, now)).not.toBe("linked");
  });

  it("respecte les désactivations, les révocations, les expirations et les échecs de livraison", () => {
    expect(workforceInvitationState({ is_active: false, user_id: "user-1" }, invitation, now)).toBe("inactive");
    expect(workforceInvitationState(employee, { ...invitation, revoked_at: now.toISOString() }, now)).toBe("revoked");
    expect(workforceInvitationState(employee, { ...invitation, delivery_status: "cancelled" }, now)).toBe("revoked");
    expect(workforceInvitationState(employee, invitation, new Date(invitation.expires_at))).toBe("expired");
    expect(workforceInvitationState(employee, { ...invitation, delivery_status: "failed" }, now)).toBe("failed");
    expect(workforceInvitationState(employee, { ...invitation, delivery_status: "sent", provider_status: "bounced" }, now)).toBe("failed");
  });

  it("ne présente jamais une mise en file comme un e-mail envoyé", () => {
    expect(workforceInvitationNotice({ ...invitation, reused: false }).title).toBe("Invitation programmée");
    expect(workforceInvitationNotice({ ...invitation, reused: true }).title).toBe("Envoi déjà en attente");
    expect(workforceInvitationNotice({ ...invitation, delivery_status: "sent", reused: false }).title).toBe("Invitation envoyée");
  });

  it("garde un état explicite lorsque le suivi de l’e-mail a été purgé", () => {
    expect(workforceInvitationState(employee, { ...invitation, delivery_status: "unknown" }, now)).toBe("unknown");
    expect(workforceInvitationNotice({ ...invitation, delivery_status: "unknown", reused: false }).title).toBe("Envoi non confirmé");
  });

  it("normalise l’adresse réelle et rejette les adresses absentes ou invalides", () => {
    expect(workforceInvitationEmail(" Alice.Martin@Example.CH ")).toBe("alice.martin@example.ch");
    for (const email of ["", "alice", "alice @example.ch", "alice@example", "a".repeat(250) + "@example.ch"]) {
      expect(() => workforceInvitationEmail(email)).toThrow();
    }
  });

  it("cherche les prochains services selon l’heure suisse, y compris au changement de date", () => {
    expect(workforceZurichClock(new Date("2026-10-18T23:15:30Z"))).toEqual({ date: "2026-10-19", time: "01:15:30" });
    expect(workforceZurichClock(new Date("2026-12-18T23:15:30Z"))).toEqual({ date: "2026-12-19", time: "00:15:30" });
  });
});
