/**
 * Structured logging helpers for edge functions.
 *
 * Goals:
 *   - Never log raw PII (email, phone, card number, auth token, etc.).
 *   - Emit a single JSON line per log so the Supabase log viewer can filter.
 *   - Make it easy to attach a request id to correlate across a single call.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

export type LogContext = Record<string, unknown>;

const TOKEN_PATTERN = /(sk-[a-zA-Z0-9_-]{20,}|sbp_[a-zA-Z0-9]{20,}|whsec_[a-zA-Z0-9]{20,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,})/g;

export function maskEmail(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.includes("@")) return null;
  const [local, domain] = raw.split("@", 2);
  if (!local || !domain) return null;
  const visible = local.length <= 2 ? local[0] : local.slice(0, 2);
  return `${visible}***@${domain}`;
}

export function maskPhone(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.length < 6) return "***";
  return `${digits.slice(0, 3)}***${digits.slice(-2)}`;
}

export function maskId(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length < 8) return null;
  return `${raw.slice(0, 4)}…${raw.slice(-4)}`;
}

/**
 * Recursively walk a payload and redact anything that looks like a secret
 * (JWT, Stripe key, Supabase PAT, webhook signing secret, …).
 */
export function sanitize<T>(value: T): T {
  if (typeof value === "string") {
    return value.replace(TOKEN_PATTERN, "[REDACTED]") as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      const lowered = key.toLowerCase();
      if (
        lowered.includes("password") ||
        lowered.includes("secret") ||
        lowered.includes("token") ||
        lowered.includes("apikey") ||
        lowered === "authorization" ||
        lowered === "cookie"
      ) {
        out[key] = "[REDACTED]";
      } else if (lowered === "email") {
        out[key] = maskEmail(v) ?? "[REDACTED]";
      } else if (lowered === "phone" || lowered === "phone_number") {
        out[key] = maskPhone(v) ?? "[REDACTED]";
      } else {
        out[key] = sanitize(v);
      }
    }
    return out as unknown as T;
  }
  return value;
}

function emit(level: LogLevel, fn: string, msg: string, ctx?: LogContext) {
  const payload = {
    level,
    fn,
    msg,
    ts: new Date().toISOString(),
    ...(ctx ? sanitize(ctx) : {}),
  };
  const line = JSON.stringify(payload);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function makeLogger(functionName: string, baseCtx: LogContext = {}) {
  const rid = crypto.randomUUID();
  const base = { rid, ...baseCtx };
  return {
    rid,
    debug: (msg: string, ctx?: LogContext) => emit("debug", functionName, msg, { ...base, ...ctx }),
    info: (msg: string, ctx?: LogContext) => emit("info", functionName, msg, { ...base, ...ctx }),
    warn: (msg: string, ctx?: LogContext) => emit("warn", functionName, msg, { ...base, ...ctx }),
    error: (msg: string, ctx?: LogContext) => emit("error", functionName, msg, { ...base, ...ctx }),
  };
}
