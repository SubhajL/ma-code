export const colorTokens = {
  canvas: "var(--color-canvas)",
  surface: "var(--color-surface)",
  border: "var(--color-border)",
  text: "var(--color-text)",
  mutedText: "var(--color-text-muted)",
  accent: "var(--color-accent)",
} as const;

export const spacingTokens = {
  xxs: "var(--space-1)",
  xs: "var(--space-2)",
  sm: "var(--space-3)",
  md: "var(--space-4)",
  lg: "var(--space-6)",
  xl: "var(--space-8)",
} as const;

export const typographyTokens = {
  bodyFontFamily: "var(--font-family-base)",
  monoFontFamily: "var(--font-family-mono)",
  bodyFontSize: "var(--font-size-body)",
  titleFontSize: "var(--font-size-title)",
  bodyLineHeight: "var(--line-height-body)",
  titleLineHeight: "var(--line-height-title)",
  regularFontWeight: "var(--font-weight-regular)",
  strongFontWeight: "var(--font-weight-strong)",
} as const;

export const themeTokens = {
  color: colorTokens,
  spacing: spacingTokens,
  typography: typographyTokens,
} as const;

export type ThemeTokens = typeof themeTokens;
