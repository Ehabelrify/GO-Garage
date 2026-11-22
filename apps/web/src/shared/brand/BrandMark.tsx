/** GO Stores brand artwork (concept pending Maher approval; see public/brand/README.md). Files are static, drop-in replaceable. */
const base = import.meta.env.BASE_URL.replace(/\/$/, "");

export const brandAssets = {
  logo: `${base}/brand/logo-primary.svg`,
  logoReversed: `${base}/brand/logo-reversed.svg`,
  mark: `${base}/brand/mark-primary.svg`,
} as const;

export type BrandMarkVariant = "lockup" | "mark" | "logo";

/** lockup: sidebar header (reversed on graphite). mark: rail and mobile top bar. logo: login and light surfaces. */
export function BrandMark({ variant = "logo", className }: { variant?: BrandMarkVariant; className?: string }) {
  const src = variant === "mark" ? brandAssets.mark : variant === "lockup" ? brandAssets.logoReversed : brandAssets.logo;
  return <img className={`brand-logo ${variant}${className ? ` ${className}` : ""}`} src={src} alt="GO Stores" draggable={false} />;
}
