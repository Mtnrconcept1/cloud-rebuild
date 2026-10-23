import { describe, expect, it } from "vitest";

import {
  parseTelegramCodexRequest,
  TELEGRAM_CODEX_INSTRUCTION_MAX_LENGTH,
  telegramCodexRequestTitle,
} from "../../supabase/functions/_shared/telegram-codex-request";

describe("Telegram Codex direct requests", () => {
  it("accepts plain text and the /codex command", () => {
    expect(parseTelegramCodexRequest("Corrige le formulaire de contact")).toEqual({
      kind: "request",
      instruction: "Corrige le formulaire de contact",
    });
    expect(parseTelegramCodexRequest("/codex@tok_bot  Ajoute un test ciblé ")).toEqual({
      kind: "request",
      instruction: "Ajoute un test ciblé",
    });
  });

  it("routes help separately and rejects unknown slash commands", () => {
    expect(parseTelegramCodexRequest("/start")).toEqual({ kind: "help" });
    expect(parseTelegramCodexRequest("/help@tok_bot")).toEqual({ kind: "help" });
    expect(parseTelegramCodexRequest("/codex")).toEqual({ kind: "help" });
    expect(parseTelegramCodexRequest("/publish now")).toEqual({
      kind: "unsupported_command",
    });
    expect(parseTelegramCodexRequest("   ")).toBeNull();
  });

  it("bounds instructions and generated titles", () => {
    const request = parseTelegramCodexRequest("x".repeat(4_000));
    expect(request?.kind).toBe("request");
    if (request?.kind === "request") {
      expect(request.instruction).toHaveLength(TELEGRAM_CODEX_INSTRUCTION_MAX_LENGTH);
      expect(telegramCodexRequestTitle(request.instruction).length).toBeLessThanOrEqual(240);
    }
  });
});
