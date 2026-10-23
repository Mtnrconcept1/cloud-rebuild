export const TELEGRAM_CODEX_INSTRUCTION_MAX_LENGTH = 3_500;

export type TelegramCodexRequest =
  | { kind: "help" }
  | { kind: "request"; instruction: string }
  | { kind: "unsupported_command" };

function commandName(value: string) {
  return value.split("@", 1)[0]?.toLowerCase() || "";
}

export function parseTelegramCodexRequest(text: unknown): TelegramCodexRequest | null {
  if (typeof text !== "string") return null;
  const normalized = text.trim();
  if (!normalized) return null;

  const firstSpace = normalized.search(/\s/);
  const firstToken = firstSpace === -1 ? normalized : normalized.slice(0, firstSpace);
  const command = firstToken.startsWith("/") ? commandName(firstToken.slice(1)) : "";

  if (command === "start" || command === "help") return { kind: "help" };
  if (command && command !== "codex") return { kind: "unsupported_command" };

  const instruction = command === "codex"
    ? normalized.slice(firstToken.length).trim()
    : normalized;
  if (!instruction) return { kind: "help" };

  return {
    kind: "request",
    instruction: instruction.slice(0, TELEGRAM_CODEX_INSTRUCTION_MAX_LENGTH),
  };
}

export function telegramCodexRequestTitle(instruction: string) {
  const compact = instruction.replace(/\s+/g, " ").trim();
  return `Demande Telegram — ${compact}`.slice(0, 240);
}
