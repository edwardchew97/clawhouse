import { describe, expect, test } from "bun:test";
import {
  asNumber,
  compactNumber,
  formatCompactUsd,
  formatPrice,
  formatSignedUsd,
  formatUsd,
  nearLabel,
  normalizePct,
  pnlClass,
  shortAccount,
  shortHash,
  signedPct,
  yoctoNearLabel,
} from "../app/lib/key-market-format";

describe("legacy-exact formatters", () => {
  test("asNumber / normalizePct", () => {
    expect(asNumber("3.5")).toBe(3.5);
    expect(asNumber("x")).toBeNull();
    expect(normalizePct(0.42)).toBe(42); // fractional -> percent
    expect(normalizePct(42)).toBe(42); // already percent
    expect(normalizePct("")).toBeNull();
  });

  test("nearLabel precision flips at 1", () => {
    expect(nearLabel(0.5)).toBe("0.50000 tNEAR");
    expect(nearLabel(12)).toBe("12.00 tNEAR");
    expect(nearLabel("x")).toBe("-");
  });

  test("yoctoNearLabel converts and validates digits", () => {
    expect(yoctoNearLabel("1000000000000000000000000")).toBe("1.00 tNEAR");
    expect(yoctoNearLabel("12.5")).toBe("-");
  });

  test("usd formatters", () => {
    expect(formatUsd(1234.5)).toBe("$1,234.50");
    expect(formatUsd(undefined)).toBe("--"); // legacy quirk: null -> Number(null)=0 -> "$0.00"
    expect(formatUsd(null)).toBe("$0.00");
    expect(formatCompactUsd(2_500_000)).toBe("$2.5M");
    expect(formatCompactUsd(1500)).toBe("$1.5K");
    expect(formatCompactUsd(42)).toBe("$42.00");
    expect(formatSignedUsd(-5)).toBe("-$5.00");
    expect(formatSignedUsd(0)).toBe("$0.00");
  });

  test("compactNumber and formatPrice tiers", () => {
    expect(compactNumber(250)).toBe("250");
    expect(compactNumber(3.14159)).toBe("3.14");
    expect(compactNumber(0.0102)).toBe("0.0102");
    expect(formatPrice(150)).toBe("$150.00");
    expect(formatPrice(2.5)).toBe("$2.50");
    expect(formatPrice(0.0102)).toBe("$0.0102");
  });

  test("pct + pnl class", () => {
    expect(signedPct(2.5)).toBe("+2.50%");
    expect(signedPct(-1)).toBe("-1.00%");
    expect(pnlClass(null)).toBe("");
    expect(pnlClass(-1)).toBe("down");
  });

  test("legacy account/hash truncation (distinct from bridge flavor)", () => {
    expect(shortAccount("short.testnet")).toBe("short.testnet");
    expect(shortAccount("a-really-long-account.testnet")).toBe("a-really-...estnet");
    expect(shortHash("abc")).toBe("abc");
    expect(shortHash("0123456789abcdef")).toBe("012345...cdef");
  });
});
