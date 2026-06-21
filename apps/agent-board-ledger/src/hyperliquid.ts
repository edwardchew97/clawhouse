import { cleanString, RequestError, type LedgerDb } from "./db.js";
import { createPaperMarketSnapshot, runPaperRiskCheck } from "./paper-trading.js";

export const HYPERLIQUID_INFO_URL_ENV = "HYPERLIQUID_INFO_URL";
export const HYPERLIQUID_DEX_ENV = "HYPERLIQUID_DEX";

const DEFAULT_HYPERLIQUID_INFO_URL = "https://api.hyperliquid.xyz/info";
const DEFAULT_MAINTENANCE_MARGIN_RATE = 0.005;

type RuntimeEnv = Record<string, string | undefined>;
type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
type JsonRecord = Record<string, unknown>;

type BodyInput = {
  raw: string;
  json: unknown;
};

type HyperliquidBookLevel = {
  px: string;
  sz: string;
  n?: number;
};

type HyperliquidBookResponse = {
  coin: string;
  time: number;
  levels: [HyperliquidBookLevel[], HyperliquidBookLevel[]];
};

type HyperliquidAssetMeta = {
  name: string;
  maxLeverage?: number;
};

type HyperliquidSpotAssetMeta = {
  name: string;
  index?: number;
};

type HyperliquidAssetContext = {
  markPx?: string;
  midPx?: string;
  oraclePx?: string;
  funding?: string;
};

type MarketType = "perp" | "spot";

export async function refreshHyperliquidPaperMarketSnapshots(
  db: LedgerDb,
  fetchLike: FetchLike,
  env: RuntimeEnv,
  body: BodyInput,
  createdAt: string,
) {
  const data = asRecord(body.json);
  const marketType = readMarketType(data);
  return await refreshHyperliquidPaperMarketSnapshotsForCoins(
    db,
    fetchLike,
    env,
    marketType,
    readCoins(data),
    createdAt,
  );
}

export async function runPaperLiquidationMonitor(
  db: LedgerDb,
  fetchLike: FetchLike,
  env: RuntimeEnv,
  createdAt: string,
) {
  const openPositions = await db.all<{ paper_account_id: string; coin: string }>(
    `SELECT DISTINCT paper_account_id, coin
       FROM paper_positions
      WHERE status = 'open'
        AND market_type = 'perp'
        AND ABS(signed_size) > 0
      ORDER BY coin ASC, paper_account_id ASC`,
  );

  if (openPositions.length === 0) {
    return {
      ok: true,
      status: "skipped_no_open_positions",
      coins: [] as string[],
      snapshots: [] as unknown[],
      accounts_checked: 0,
      liquidations: [] as unknown[],
      failures: [] as unknown[],
    };
  }

  const coins = [...new Set(openPositions.map((position) => normalizeCoin(position.coin)))];
  const refreshed = await refreshHyperliquidPaperMarketSnapshotsForCoins(db, fetchLike, env, "perp", coins, createdAt);
  const accounts = [...new Set(openPositions.map((position) => position.paper_account_id))];
  const riskChecks = [];
  const liquidations = [];

  for (const accountId of accounts) {
    const check = await runPaperRiskCheck(db, accountId, createdAt);
    riskChecks.push(check);
    liquidations.push(...check.liquidations);
  }

  return {
    ok: true,
    status: liquidations.length > 0 ? "liquidations_executed" : "checked",
    coins,
    snapshots: refreshed.snapshots,
    accounts_checked: accounts.length,
    risk_checks: riskChecks,
    liquidations,
    failures: [] as unknown[],
  };
}

async function refreshHyperliquidPaperMarketSnapshotsForCoins(
  db: LedgerDb,
  fetchLike: FetchLike,
  env: RuntimeEnv,
  marketType: MarketType,
  coins: string[],
  createdAt: string,
) {
  const uniqueCoins = [...new Set(coins.map(normalizeCoin))];
  if (uniqueCoins.length === 0) throw new RequestError("At least one coin is required", 400);

  const infoUrl = cleanString(env[HYPERLIQUID_INFO_URL_ENV]) ?? DEFAULT_HYPERLIQUID_INFO_URL;
  const dex = cleanString(env[HYPERLIQUID_DEX_ENV]) ?? undefined;
  const metaAndContexts = marketType === "spot"
    ? await fetchHyperliquidSpotMetaAndAssetContexts(fetchLike, infoUrl)
    : await fetchHyperliquidMetaAndAssetContexts(fetchLike, infoUrl, dex);
  const snapshots = [];

  for (const coin of uniqueCoins) {
    const market = marketType === "spot"
      ? readHyperliquidSpotAsset(metaAndContexts, coin)
      : readHyperliquidAsset(metaAndContexts, coin);
    const book = await fetchHyperliquidBook(
      fetchLike,
      infoUrl,
      marketType === "spot" ? market.bookCoin : coin,
      marketType === "spot" ? undefined : dex,
    );
    const bodyJson = {
      market_type: marketType,
      coin,
      source: "hyperliquid",
      mark_px: market.markPx,
      oracle_px: market.oraclePx,
      funding_rate: market.fundingRate,
      max_leverage: market.maxLeverage,
      maintenance_margin_rate: DEFAULT_MAINTENANCE_MARGIN_RATE,
      observed_at: new Date(book.time).toISOString(),
      book: {
        bids: book.levels[0].map(presentLevel),
        asks: book.levels[1].map(presentLevel),
      },
    };
    const result = await createPaperMarketSnapshot(db, {
      raw: JSON.stringify(bodyJson),
      json: bodyJson,
    }, createdAt);
    snapshots.push(result.snapshot);
  }

  return {
    ok: true,
    source: "hyperliquid",
    market_type: marketType,
    info_url: infoUrl,
    coins: uniqueCoins,
    snapshots,
  };
}

async function fetchHyperliquidSpotMetaAndAssetContexts(fetchLike: FetchLike, infoUrl: string) {
  const response = await postHyperliquidInfo(fetchLike, infoUrl, { type: "spotMetaAndAssetCtxs" });
  if (!Array.isArray(response) || response.length < 2) {
    throw new RequestError("Hyperliquid spotMetaAndAssetCtxs response is invalid", 502);
  }
  const meta = asRecord(response[0]);
  const universe = meta.universe;
  const contexts = response[1];
  if (!Array.isArray(universe) || !Array.isArray(contexts)) {
    throw new RequestError("Hyperliquid spotMetaAndAssetCtxs response is missing universe or contexts", 502);
  }
  return { universe, contexts };
}

async function fetchHyperliquidBook(fetchLike: FetchLike, infoUrl: string, coin: string, dex: string | undefined) {
  const body: JsonRecord = { type: "l2Book", coin };
  if (dex) body.dex = dex;
  const response = await postHyperliquidInfo(fetchLike, infoUrl, body);
  const data = asRecord(response) as Partial<HyperliquidBookResponse>;
  if (!Array.isArray(data.levels) || data.levels.length !== 2) {
    throw new RequestError(`Hyperliquid l2Book response for ${coin} is missing levels`, 502);
  }
  const time = typeof data.time === "number" ? data.time : NaN;
  if (!Number.isFinite(time)) {
    throw new RequestError(`Hyperliquid l2Book response for ${coin} is missing time`, 502);
  }
  return {
    coin,
    time,
    levels: [
      readLevels(data.levels[0], `${coin}.bids`),
      readLevels(data.levels[1], `${coin}.asks`),
    ] as [HyperliquidBookLevel[], HyperliquidBookLevel[]],
  };
}

async function fetchHyperliquidMetaAndAssetContexts(fetchLike: FetchLike, infoUrl: string, dex: string | undefined) {
  const body: JsonRecord = { type: "metaAndAssetCtxs" };
  if (dex) body.dex = dex;
  const response = await postHyperliquidInfo(fetchLike, infoUrl, body);
  if (!Array.isArray(response) || response.length < 2) {
    throw new RequestError("Hyperliquid metaAndAssetCtxs response is invalid", 502);
  }
  const meta = asRecord(response[0]);
  const universe = meta.universe;
  const contexts = response[1];
  if (!Array.isArray(universe) || !Array.isArray(contexts)) {
    throw new RequestError("Hyperliquid metaAndAssetCtxs response is missing universe or contexts", 502);
  }
  return { universe, contexts };
}

async function postHyperliquidInfo(fetchLike: FetchLike, infoUrl: string, body: JsonRecord) {
  const response = await fetchLike(infoUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new RequestError(`Hyperliquid info endpoint returned ${response.status}: ${text}`, 502);
  }
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new RequestError(`Hyperliquid info endpoint returned non-JSON: ${text}`, 502);
  }
}

function readHyperliquidAsset(metaAndContexts: { universe: unknown[]; contexts: unknown[] }, coin: string) {
  const index = metaAndContexts.universe.findIndex((item) => {
    const asset = asRecord(item) as Partial<HyperliquidAssetMeta>;
    return cleanString(asset.name)?.toUpperCase() === coin;
  });
  if (index < 0) throw new RequestError(`Hyperliquid asset not found: ${coin}`, 400);

  const meta = asRecord(metaAndContexts.universe[index]) as Partial<HyperliquidAssetMeta>;
  const context = asRecord(metaAndContexts.contexts[index]) as Partial<HyperliquidAssetContext>;
  const markPx = readPositiveNumber(context.markPx ?? context.midPx ?? context.oraclePx, `${coin}.markPx`);
  return {
    bookCoin: coin,
    markPx,
    oraclePx: readOptionalPositiveNumber(context.oraclePx, `${coin}.oraclePx`),
    fundingRate: readOptionalNumber(context.funding, `${coin}.funding`),
    maxLeverage: readOptionalPositiveNumber(meta.maxLeverage, `${coin}.maxLeverage`),
  };
}

function readHyperliquidSpotAsset(metaAndContexts: { universe: unknown[]; contexts: unknown[] }, coin: string) {
  const index = metaAndContexts.universe.findIndex((item) => {
    const asset = asRecord(item) as Partial<HyperliquidSpotAssetMeta>;
    return cleanString(asset.name)?.toUpperCase() === coin || readSpotBookCoin(asset)?.toUpperCase() === coin;
  });
  if (index < 0) throw new RequestError(`Hyperliquid spot asset not found: ${coin}`, 400);

  const meta = asRecord(metaAndContexts.universe[index]) as Partial<HyperliquidSpotAssetMeta>;
  const context = asRecord(metaAndContexts.contexts[index]) as Partial<HyperliquidAssetContext>;
  const markPx = readPositiveNumber(context.markPx ?? context.midPx ?? context.oraclePx, `${coin}.markPx`);
  return {
    bookCoin: readSpotBookCoin(meta) ?? coin,
    markPx,
    oraclePx: readOptionalPositiveNumber(context.oraclePx, `${coin}.oraclePx`),
    fundingRate: null,
    maxLeverage: null,
  };
}

function readSpotBookCoin(asset: Partial<HyperliquidSpotAssetMeta>) {
  const name = cleanString(asset.name)?.toUpperCase();
  if (name === "PURR/USDC") return "PURR/USDC";
  if (typeof asset.index === "number" && Number.isInteger(asset.index) && asset.index >= 0) return `@${asset.index}`;
  return null;
}

function presentLevel(level: HyperliquidBookLevel) {
  return {
    px: readPositiveNumber(level.px, "level.px"),
    sz: readPositiveNumber(level.sz, "level.sz"),
    n: typeof level.n === "number" ? level.n : null,
  };
}

function readLevels(value: unknown, name: string): HyperliquidBookLevel[] {
  if (!Array.isArray(value)) throw new RequestError(`Hyperliquid ${name} levels are invalid`, 502);
  return value.map((item) => {
    const level = asRecord(item);
    return {
      px: requiredString(level.px, `${name}.px`),
      sz: requiredString(level.sz, `${name}.sz`),
      n: typeof level.n === "number" ? level.n : undefined,
    };
  });
}

function readCoins(data: JsonRecord) {
  const value = data.coins ?? data.coin;
  if (Array.isArray(value)) return value.map(normalizeCoin);
  return [normalizeCoin(value)];
}

function readMarketType(data: JsonRecord): MarketType {
  const value = cleanString(data.marketType ?? data.market_type) ?? "perp";
  const normalized = value.toLowerCase();
  if (normalized === "perp" || normalized === "perps" || normalized === "futures") return "perp";
  if (normalized === "spot") return "spot";
  throw new RequestError("market_type must be perp or spot", 400);
}

function normalizeCoin(value: unknown) {
  return requiredString(value, "coin").toUpperCase();
}

function requiredString(value: unknown, name: string) {
  const normalized = cleanString(value);
  if (!normalized) throw new RequestError(`${name} is required`, 400);
  return normalized;
}

function readPositiveNumber(value: unknown, name: string) {
  const parsed = readOptionalNumber(value, name);
  if (parsed === null || parsed <= 0) throw new RequestError(`${name} must be greater than 0`, 502);
  return parsed;
}

function readOptionalPositiveNumber(value: unknown, name: string) {
  const parsed = readOptionalNumber(value, name);
  if (parsed !== null && parsed <= 0) throw new RequestError(`${name} must be greater than 0`, 502);
  return parsed;
}

function readOptionalNumber(value: unknown, name: string) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new RequestError(`${name} must be a number`, 502);
  return parsed;
}

function asRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RequestError("Expected JSON object", 502);
  }
  return value as JsonRecord;
}
