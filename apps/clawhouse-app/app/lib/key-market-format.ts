/**
 * Legacy-exact display formatters ported from `public/clawhouse-fomo-layout.js`.
 *
 * These reproduce the panel-rendering formatters byte-for-byte so ported React
 * panels render identically. NOTE: `shortAccount`/`shortHash` here intentionally
 * differ from `app/lib/format.ts` (the wallet-bridge flavor: >20/10/7 and 6/4
 * without the length guard). The panels have always used these legacy rules; the
 * divergence is pre-existing and preserved deliberately. Unifying the two is a
 * follow-up decision because it would change some on-screen text.
 */

export function asNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  return asNumber(value);
}

export function normalizePct(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = asNumber(value);
  if (numeric === null) return null;
  return Math.abs(numeric) <= 1 ? numeric * 100 : numeric;
}

export function money(value: number, suffix = " tNEAR") {
  if (!Number.isFinite(value)) return "--";
  return `${value.toFixed(2)}${suffix}`;
}

export function nearLabel(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "-";
  return `${numeric.toFixed(numeric < 1 ? 5 : 2)} tNEAR`;
}

export function keyAmountLabel(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "--";
  return `${numeric} Key`;
}

export function wholeKeyAmount(value: unknown): number | null {
  const numeric = Math.floor(Number(value));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

/** Floor a raw amount input to a positive integer, or 0 if invalid. */
export function normalizedAmountOrZero(value: unknown): number {
  const parsed = Number(String(value || "").trim());
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.floor(parsed);
}

export function averageKeyPriceLabel(totalNear: unknown, amount: unknown) {
  const numericTotal = Number(totalNear);
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericTotal) || !Number.isFinite(numericAmount) || numericAmount <= 0) return "--";
  return nearLabel(numericTotal / numericAmount);
}

export function yoctoNearLabel(value: unknown) {
  const text = String(value ?? "");
  if (!/^\d+$/.test(text)) return "-";
  return nearLabel(Number(text) / 1e24);
}

/** Legacy panel truncation: >18 chars → first 9 … last 6. */
export function shortAccount(accountId: string) {
  return accountId.length > 18 ? `${accountId.slice(0, 9)}...${accountId.slice(-6)}` : accountId;
}

/** Legacy panel truncation: ≤12 chars unchanged, else first 6 … last 4. */
export function shortHash(value: unknown) {
  const text = String(value || "");
  if (text.length <= 12) return text;
  return `${text.slice(0, 6)}...${text.slice(-4)}`;
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

export function formatBackendTime(value: unknown) {
  if (!value) return "no timestamp";
  const parsed = Date.parse(String(value));
  if (!Number.isFinite(parsed)) return String(value);
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(parsed));
}

export function titleCase(value: unknown) {
  return String(value || "event")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function formatBackendAmount(amount: unknown, asset?: string) {
  const numeric = asNumber(amount);
  if (numeric === null) return asset || "";
  const value = numeric >= 100 ? numeric.toFixed(0) : numeric >= 1 ? numeric.toFixed(2) : numeric.toFixed(5);
  return `${value}${asset ? ` ${asset}` : ""}`;
}

export function formatUsd(value: unknown) {
  const numeric = asNumber(value);
  if (numeric === null) return "--";
  return `$${numeric.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatCompactUsd(value: unknown) {
  const numeric = asNumber(value);
  if (numeric === null) return "--";
  const absolute = Math.abs(numeric);
  if (absolute >= 1_000_000) return `$${(numeric / 1_000_000).toFixed(2).replace(/\.?0+$/, "")}M`;
  if (absolute >= 1_000) return `$${(numeric / 1_000).toFixed(2).replace(/\.?0+$/, "")}K`;
  return formatUsd(numeric);
}

export function formatSignedUsd(value: unknown) {
  const numeric = asNullableNumber(value);
  if (numeric === null) return "--";
  const sign = numeric > 0 ? "+" : numeric < 0 ? "-" : "";
  return `${sign}${formatUsd(Math.abs(numeric))}`;
}

export function formatUtcTime(value: unknown) {
  if (!value) return "--";
  const parsed = Date.parse(String(value));
  if (!Number.isFinite(parsed)) return String(value);
  return new Date(parsed).toISOString().replace(".000Z", "Z");
}

export function compactNumber(value: unknown, digits = 4) {
  const numeric = asNumber(value);
  if (numeric === null) return "--";
  if (Math.abs(numeric) >= 100) return numeric.toFixed(0);
  if (Math.abs(numeric) >= 1) return numeric.toFixed(2);
  return numeric.toFixed(digits).replace(/0+$/, "").replace(/\.$/, "");
}

export function formatPrice(value: unknown) {
  const numeric = asNumber(value);
  if (numeric === null) return "--";
  if (Math.abs(numeric) >= 100) return formatUsd(numeric);
  if (Math.abs(numeric) >= 1) return `$${numeric.toFixed(2)}`;
  return `$${numeric.toFixed(5).replace(/0+$/, "").replace(/\.$/, "")}`;
}

export function signedPct(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function pnlLabel(value: number | null) {
  return value === null ? "--" : signedPct(value);
}

export function pnlClass(value: number | null) {
  if (value === null) return "";
  return value >= 0 ? "up" : "down";
}
