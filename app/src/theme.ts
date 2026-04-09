/** Shared design tokens — matches Figma "Home - Compact & Squared" system. */

export const C = {
  // Backgrounds
  bg: "#F8F9FA",
  bgTonal: "rgba(250,250,250,0.5)",
  surface: "#FFFFFF",
  surfaceAlt: "#F3F4F5",
  surfaceMuted: "#EDEEEF",
  surfaceGlass: "rgba(255,255,255,0.8)",

  // Green accent family
  green900: "#064E3B",
  green800: "#005331",
  green700: "#006D43",
  green600: "#047857",
  green500: "#059669",
  green400: "#00D084",
  greenLight: "#ECFDF5",
  greenGradientStart: "#006D43",
  greenGradientEnd: "#00D084",
  greenSubtle: "rgba(0,208,132,0.2)",

  // Text
  textPrimary: "#191C1D",
  textBody: "#3C4A40",
  textMuted: "#5F5E5E",
  textSubtle: "#636262",
  textPlaceholder: "#A1A1AA",
  textInactive: "#71717A",

  // Borders
  border: "rgba(186,203,189,0.1)",
  borderStrong: "rgba(186,203,189,0.15)",
  borderAccent: "rgba(186,203,189,0.3)",
  borderNav: "#F4F4F5",

  // Semantic
  red: "#AE2F34",
  redBg: "rgba(174,47,52,0.1)",
  amber: "#D97706",
  star: "#FBBF24",
  white: "#FFFFFF",

  // Shadows
  shadowSm: {
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  } as const,
  shadowMd: {
    shadowColor: "rgba(6,78,59,0.1)",
    shadowOpacity: 1,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  } as const,
  shadowGlow: {
    shadowColor: "rgba(0,208,132,0.06)",
    shadowOpacity: 1,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: -4 },
    elevation: 8,
  } as const,
} as const;

/** Standard border-radius values */
export const R = {
  sm: 6,
  md: 16,
  lg: 32,
  xl: 48,
  pill: 9999,
} as const;
