import type { CSSProperties } from 'react';

/**
 * Logo Keuanganku: koin emas di atas kotak merah.
 * Tepi bawah koin yang lebih gelap memberi kesan tebal; kilau kecil di kiri atas tetap terbaca di 16px.
 */
export const BRAND = {
  red: '#D7372B',
  gold: '#F6C445',
  goldDeep: '#E0A82E',
  goldEdge: '#C98A1E',
  shine: '#FFF4CF',
} as const;

export function LogoMark({
  size = 32,
  className,
  coinClassName,
  style,
  title,
}: {
  size?: number;
  className?: string;
  /** Kelas untuk grup koin, mis. agar koin bisa dianimasikan terpisah dari kotaknya. */
  coinClassName?: string;
  style?: CSSProperties;
  title?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      style={style}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <rect width="32" height="32" rx="9" fill={BRAND.red} />
      <g className={coinClassName}>
      <circle cx="16" cy="16.8" r="9.6" fill={BRAND.goldEdge} />
      <circle cx="16" cy="15.6" r="9.6" fill={BRAND.gold} />
      <circle cx="16" cy="15.6" r="7.2" fill={BRAND.goldDeep} />
      <circle cx="16" cy="15.6" r="5.6" fill={BRAND.gold} />
      <path d="M9.3 12.9c.6-2 2-3.5 3.9-4.3.5-.2.9.4.5.8-1.5.9-2.6 2.2-3.3 3.8-.3.6-1.2.3-1.1-.3z" fill={BRAND.shine} />
      </g>
    </svg>
  );
}

export function Wordmark({ className = '' }: { className?: string }) {
  return <span className={`wordmark ${className}`}>Keuanganku</span>;
}
