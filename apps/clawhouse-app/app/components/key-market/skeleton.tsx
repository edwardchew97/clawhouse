import type { CSSProperties } from "react";

/** Inline shimmer placeholder. Mirrors the legacy `skeleton()` markup. */
export function Skeleton({ width = "44px", className = "" }: { width?: string; className?: string }) {
  return <span className={`ui-skeleton ${className}`} style={{ ["--skeleton-width" as string]: width } as CSSProperties} />;
}
