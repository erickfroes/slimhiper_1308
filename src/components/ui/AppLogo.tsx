'use client';

import React, { memo, useMemo } from 'react';
import AppIcon from './AppIcon';
import AppImage from './AppImage';
import { visualAssets } from '@/lib/visualAssets';

type AppLogoVariant = 'primary' | 'symbol' | 'reversed';
type AppLogoSurface = 'light' | 'dark';

interface AppLogoProps {
  src?: string; // Image source (optional)
  iconName?: string; // Icon name when no image
  size?: number; // Size for icon/image
  className?: string; // Additional classes
  onClick?: () => void; // Click handler
  /** Semantic brand asset used when `src` is not supplied. */
  variant?: AppLogoVariant;
  /** Selects the accessible reversed logo on dark surfaces. */
  surface?: AppLogoSurface;
  /** Shortcut for the compact symbol treatment. */
  compact?: boolean;
  alt?: string;
}

const AppLogo = memo(function AppLogo({
  src,
  iconName = 'SparklesIcon',
  size = 64,
  className = '',
  onClick,
  variant = 'primary',
  surface = 'light',
  compact = false,
  alt = 'SlimHiper',
}: AppLogoProps) {
  // Memoize className calculation
  const containerClassName = useMemo(() => {
    const classes = ['flex items-center'];
    if (onClick) classes.push('cursor-pointer hover:opacity-80 transition-opacity');
    if (className) classes.push(className);
    return classes.join(' ');
  }, [onClick, className]);

  const resolvedSrc = useMemo(() => {
    if (src !== undefined) return src;
    if (surface === 'dark' || variant === 'reversed') return visualAssets.brandLogoReversed;
    if (compact || variant === 'symbol') return visualAssets.brandLogoSymbol;
    return visualAssets.brandLogoPrimary;
  }, [compact, src, surface, variant]);

  return (
    <div className={containerClassName} onClick={onClick}>
      {/* Show image if src provided, otherwise show icon */}
      {resolvedSrc ? (
        <AppImage
          src={resolvedSrc}
          alt={alt}
          width={size}
          height={size}
          className="flex-shrink-0"
          priority={true}
          style={{ width: size, height: size }}
          unoptimized={resolvedSrc.endsWith('.svg')}
        />
      ) : (
        <AppIcon name={iconName} size={size} className="flex-shrink-0" />
      )}
    </div>
  );
});

export default AppLogo;
