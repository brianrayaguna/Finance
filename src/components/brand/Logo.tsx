import type { CSSProperties } from 'react';

/**
 * Logo Keuanganku — monogram "K" terbelah di atas kotak hijau hutan.
 * Lengan atas (krem) naik = pemasukan, kaki bawah (terakota) turun = pengeluaran.
 */
export const BRAND = {
  forest: '#263E35',
  cream: '#F2EEE5',
  clay: '#C4764F',
} as const;

export function LogoMark({ size = 32, className, style, title }: { size?: number; className?: string; style?: CSSProperties; title?: string }) {
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
      <rect width="32" height="32" rx="9" fill={BRAND.forest} />
      <rect x="9" y="8" width="3.8" height="16" rx="1.2" fill={BRAND.cream} />
      <path d="M23.4 8h-4.9l-5.2 6.4 2.45 3z" fill={BRAND.cream} />
      <path d="M16.9 17.95 22.1 24h-4.9l-2.68-3.12z" fill={BRAND.clay} />
    </svg>
  );
}

export function Wordmark({ className = '' }: { className?: string }) {
  return <span className={`wordmark ${className}`}>Keuanganku</span>;
}
