export const PAPER_SIZE_DECIMALS = 8;
export const PAPER_PRICE_DECIMALS = 8;
export const PAPER_QUOTE_DECIMALS = 8;

export function decimalToAtoms(value: unknown, decimals: number): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" && typeof value !== "string") return null;
  const text = typeof value === "number" ? value.toFixed(decimals) : value.trim();
  if (text === "") return null;
  const sign = text.startsWith("-") ? "-" : "";
  const unsigned = sign ? text.slice(1) : text;
  const [whole = "0", fraction = ""] = unsigned.split(".");
  const paddedFraction = `${fraction}${"0".repeat(decimals)}`.slice(0, decimals);
  const roundedDigit = fraction[decimals] ? Number(fraction[decimals]) : 0;
  let atoms = BigInt(`${whole || "0"}${paddedFraction || ""}`);
  if (roundedDigit >= 5) atoms += 1n;
  return `${sign}${atoms.toString()}`;
}

export function quoteAtoms(value: unknown) {
  return decimalToAtoms(value, PAPER_QUOTE_DECIMALS);
}

export function priceAtoms(value: unknown) {
  return decimalToAtoms(value, PAPER_PRICE_DECIMALS);
}

export function sizeAtoms(value: unknown) {
  return decimalToAtoms(value, PAPER_SIZE_DECIMALS);
}
