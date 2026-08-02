/**
 * Single source of truth for the password policy enforced by Supabase Auth.
 *
 * Supabase refuses any password that misses one of its required character
 * classes and answers `422` with:
 *
 *   Password should contain at least one character of each:
 *   abcdefghijklmnopqrstuvwxyz, ABCDEFGHIJKLMNOPQRSTUVWXYZ, 0123456789,
 *   !@#$%^&*()_+-=[]{};'\:"|<>?,./`~.
 *
 * The client used to accept any non-alphanumeric character, so passwords built
 * around `é`, `€` or `ö` passed local validation and were only refused by the
 * server. REQUIRED_SYMBOLS must stay byte-identical to the
 * `password_required_characters` setting of the Supabase project.
 */
export const REQUIRED_SYMBOLS = "!@#$%^&*()_+-=[]{};'\\:\"|<>?,./`~";

export const MIN_PASSWORD_LENGTH = 10;

export const PASSWORD_POLICY_HINT =
  `Au moins ${MIN_PASSWORD_LENGTH} caractères, dont une minuscule, une majuscule, `
  + `un chiffre et un symbole parmi ${REQUIRED_SYMBOLS}`;

/**
 * Membership test rather than a regular expression: the required set contains
 * `\`, `]`, `-` and `/`, which are all error-prone to escape inside a character
 * class, and a silent escaping mistake would reopen the exact gap this module
 * exists to close.
 */
export function hasRequiredSymbol(password: string): boolean {
  for (const character of password) {
    if (REQUIRED_SYMBOLS.includes(character)) return true;
  }
  return false;
}

/** Returns a user-facing message when the password cannot satisfy Supabase. */
export function getPasswordPolicyError(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`;
  }
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    return "Utilisez au moins une minuscule, une majuscule et un chiffre.";
  }
  if (!hasRequiredSymbol(password)) {
    return `Ajoutez au moins un symbole parmi ${REQUIRED_SYMBOLS} — les caractères accentués comme « é » ne comptent pas.`;
  }
  return null;
}

/** Policy check plus confirmation match, for the two-field password forms. */
export function getPasswordError(password: string, confirmation: string): string | null {
  const policyError = getPasswordPolicyError(password);
  if (policyError) return policyError;
  if (password !== confirmation) return "Les deux mots de passe ne correspondent pas.";
  return null;
}
