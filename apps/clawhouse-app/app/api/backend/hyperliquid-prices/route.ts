import { NextResponse } from "next/server";
import { firstEnv } from "../../../lib/env";

export const dynamic = "force-dynamic";

const defaultInfoUrl = "https://api.hyperliquid.xyz/info";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const coins = uniqueCoins(searchParams.get("coins"));
    if (!coins.length) {
      return NextResponse.json({ ok: true, prices: [], missing: [] });
    }

    const infoUrl = firstEnv(["HYPERLIQUID_INFO_URL"]) ?? defaultInfoUrl;
    const body: Record<string, unknown> = { type: "metaAndAssetCtxs" };
    const dex = firstEnv(["HYPERLIQUID_DEX"]);
    if (dex) body.dex = dex;

    const response = await fetch(infoUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const payload = await response.json();
    if (!response.ok || !Array.isArray(payload) || !Array.isArray(payload[0]?.universe) || !Array.isArray(payload[1])) {
      return NextResponse.json({ ok: false, error: "Hyperliquid price read failed" }, { status: 502 });
    }

    const universe = payload[0].universe as Array<{ name?: unknown }>;
    const contexts = payload[1] as Array<{ markPx?: unknown; midPx?: unknown; oraclePx?: unknown }>;
    const prices = coins.flatMap((coin) => {
      const index = universe.findIndex((asset) => String(asset?.name || "").toUpperCase() === coin);
      if (index < 0) return [];
      const markPx = asPositiveNumber(contexts[index]?.markPx ?? contexts[index]?.midPx ?? contexts[index]?.oraclePx);
      return markPx === null ? [] : [{ coin, mark_px: markPx }];
    });
    const priced = new Set(prices.map((price) => price.coin));
    const missing = coins.filter((coin) => !priced.has(coin));
    const next = NextResponse.json({ ok: true, prices, missing });
    next.headers.set("cache-control", "no-store");
    return next;
  } catch {
    return NextResponse.json({ ok: false, error: "Hyperliquid price read failed" }, { status: 502 });
  }
}

function uniqueCoins(value: string | null) {
  return [...new Set(String(value || "")
    .split(",")
    .map((coin) => coin.trim().toUpperCase())
    .filter((coin) => /^[A-Z0-9/_-]{1,32}$/.test(coin)))]
    .slice(0, 80);
}

function asPositiveNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}
