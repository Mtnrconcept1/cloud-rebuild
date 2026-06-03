import { create as createQrCode } from "qrcode";

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
  const qrCode = createQrCode(normalized || "000000", { errorCorrectionLevel: "M" });
  const moduleCount = qrCode.modules.size;
  const quietZone = 4;
  const viewBoxSize = moduleCount + quietZone * 2;
  const cells: string[] = [];

  for (let row = 0; row < moduleCount; row += 1) {
    for (let col = 0; col < moduleCount; col += 1) {
      if (qrCode.modules.get(row, col)) {
        cells.push(`<rect x="${col + quietZone}" y="${row + quietZone}" width="1" height="1"/>`);
      }
    }
  }

  const pixelSize = Math.max(96, Math.round(size));
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${pixelSize}" height="${pixelSize}" viewBox="0 0 ${viewBoxSize} ${viewBoxSize}" role="img" aria-label="QR de preuve de livraison">`,
    '<rect width="100%" height="100%" fill="#fff"/>',
    `<g fill="#111827">${cells.join("")}</g>`,
    "</svg>",
  ].join("");

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}
