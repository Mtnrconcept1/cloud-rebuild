export const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

export function isCaptchaEnabled() {
  return Boolean(TURNSTILE_SITE_KEY);
}
