export const CHART_THEMES = { light: "", dark: ".dark" } as const;

const CSS_IDENTIFIER_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,79}$/;
const CSS_COLOR_FORBIDDEN_PATTERN = /[;{}<>]|\/\*|\*\/|@import|url\s*\(|expression\s*\(|javascript:/i;
const CSS_COLOR_ALLOWED_PATTERN =
  /^(?:#[0-9a-f]{3,8}|(?:rgb|rgba|hsl|hsla|oklch|color-mix)\([a-z0-9\s,./%#+-]*(?:var\(--[a-z0-9_-]+\))?[a-z0-9\s,./%#+-]*\)|var\(--[a-z0-9_-]+\)|[a-z]+)$/i;

export type SecureChartStyleConfig = Record<string, {
  color?: string;
  theme?: Record<keyof typeof CHART_THEMES, string>;
}>;

export function normalizeChartCssIdentifier(value: string) {
  const normalized = String(value || "").trim().replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+/, "");
  if (CSS_IDENTIFIER_PATTERN.test(normalized)) return normalized;
  return "chart";
}

export function normalizeChartCssVariableKey(value: string) {
  const normalized = String(value || "").trim();
  return CSS_IDENTIFIER_PATTERN.test(normalized) ? normalized : null;
}

export function normalizeChartCssColor(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized || CSS_COLOR_FORBIDDEN_PATTERN.test(normalized)) return null;
  return CSS_COLOR_ALLOWED_PATTERN.test(normalized) ? normalized : null;
}

export function buildChartStyleCss({
  id,
  config,
}: {
  id: string;
  config: SecureChartStyleConfig;
}) {
  const chartId = normalizeChartCssIdentifier(id);
  const colorConfig = Object.entries(config).filter(([_, itemConfig]) => itemConfig.theme || itemConfig.color);

  if (!colorConfig.length) return "";

  return Object.entries(CHART_THEMES)
    .map(([theme, prefix]) => {
      const declarations = colorConfig
        .map(([key, itemConfig]) => {
          const safeKey = normalizeChartCssVariableKey(key);
          const color = normalizeChartCssColor(
            itemConfig.theme?.[theme as keyof typeof itemConfig.theme] || itemConfig.color,
          );

          return safeKey && color ? `  --color-${safeKey}: ${color};` : null;
        })
        .filter(Boolean)
        .join("\n");

      if (!declarations) return "";
      return `
${prefix} [data-chart=${chartId}] {
${declarations}
}
`;
    })
    .filter(Boolean)
    .join("\n");
}
