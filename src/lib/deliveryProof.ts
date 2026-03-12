const DELIVERY_PROOF_CODE_LENGTH = 6;

export function normalizeDeliveryProofCode(value: string | null | undefined) {
  return String(value || "")
    .replace(/\D/g, "")
    .slice(0, DELIVERY_PROOF_CODE_LENGTH);
}

export function formatDeliveryProofCode(value: string | null | undefined) {
  const normalized = normalizeDeliveryProofCode(value);
  return normalized.replace(/(\d{3})(\d{1,3})?/, (_, first, second = "") =>
    second ? `${first} ${second}` : first,
  );
}

export function isValidDeliveryProofCode(value: string | null | undefined) {
  return normalizeDeliveryProofCode(value).length === DELIVERY_PROOF_CODE_LENGTH;
}

export function buildDeliveryProofQrImageUrl(code: string, size = 220) {
  const normalized = normalizeDeliveryProofCode(code);
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&format=svg&data=${encodeURIComponent(normalized)}`;
}
