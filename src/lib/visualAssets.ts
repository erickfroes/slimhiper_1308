/**
 * Canonical, renderable SlimHiper visual assets.
 *
 * Design boards in `design/visual-reference` are intentionally omitted: they
 * guide implementation but must never be rendered as product screenshots.
 */
export const visualAssets = {
  brandLogoPrimary: '/assets/brand/logo-primary.png',
  brandLogoSymbol: '/assets/brand/logo-symbol.png',
  brandLogoReversed: '/assets/brand/logo-reversed.png',
  brandAppIcon: '/assets/brand/app-icon.png',
  brandFavicon: '/assets/brand/favicon.png',
  brandPatternLight: '/assets/patterns/progress-trajectory-light.png',
  brandPatternDark: '/assets/patterns/progress-trajectory-dark.png',
} as const;

export type VisualAssetKey = keyof typeof visualAssets;
