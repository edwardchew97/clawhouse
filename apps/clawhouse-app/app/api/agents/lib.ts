import { fetchBackendJson, getBackendConfig, publicBackendConfig } from "../backend/lib";
import {
  formatState,
  getKeyMarketConfig,
  viewFunction,
  type MarketState,
} from "../key-market/lib";

type CuratedAgentConfig = {
  id: string;
  boardId: string;
  name: string;
  initials: string;
  bannerUrl: string;
  strategy: string;
  description: string;
  gate: string;
  source: string;
};

export type DiscoveryAgent = CuratedAgentConfig & {
  status: "available" | "configured";
  keyMarket: DiscoveryReadback;
  board: DiscoveryReadback;
  pnl: DiscoveryReadback;
};

type DiscoveryReadback = {
  status: "available" | "unavailable";
  data?: unknown;
  error?: string;
};

const DEFAULT_AGENT_BANNER_URL = "/agent-banners/default-agent-banner.png";

export async function readAgentDiscovery() {
  const backendDiscovery = await readBackendDiscoveryAgents();
  const discoveredAgents = backendDiscovery.status === "available" && backendDiscovery.agents.length > 0;
  const agentConfigs = discoveredAgents ? backendDiscovery.agents : getCuratedAgents();
  const agents = await Promise.all(agentConfigs.map(readDiscoveryAgent));
  return {
    ok: true,
    mode: discoveredAgents ? "agent-board-ledger" : "curated",
    count: agents.length,
    config: {
      keyMarket: publicKeyMarketConfig(),
      backend: publicBackendConfig(),
    },
    discovery: {
      status: backendDiscovery.status,
      count: backendDiscovery.agents.length,
      error: backendDiscovery.error,
    },
    agents,
  };
}

function getCuratedAgents(): CuratedAgentConfig[] {
  const explicitAgents = parseCuratedAgentIds(process.env.CLAWHOUSE_CURATED_AGENT_IDS);
  if (explicitAgents.length) return explicitAgents;

  const defaultAgentId = getKeyMarketConfig().defaultAgentId;
  return [agentConfig(defaultAgentId, getBackendConfig().defaultBoardId, "CLAWHOUSE_DEFAULT_AGENT_ID")];
}

async function readDiscoveryAgent(agent: CuratedAgentConfig): Promise<DiscoveryAgent> {
  const timeoutMs = discoveryReadbackTimeoutMs();
  const [keyMarket, board, pnl] = await Promise.allSettled([
    withTimeout(
      viewFunction<MarketState>("get_state", {
        agent_id: agent.id,
        holder_id: null,
      }),
      timeoutMs,
      "Key-market readback timed out",
    ),
    withTimeout(
      fetchBackendJson(`/boards/${encodeURIComponent(agent.boardId)}`),
      timeoutMs,
      "Backend board readback timed out",
    ),
    withTimeout(
      fetchBackendJson(`/boards/${encodeURIComponent(agent.boardId)}/pnl`),
      timeoutMs,
      "Backend P&L readback timed out",
    ),
  ]);

  const keyMarketReadback = settledReadback(keyMarket, (state) => formatState(state));
  const boardReadback = settledReadback(board, (data) => data);
  const pnlReadback = settledReadback(pnl, (data) => data);

  return {
    ...agent,
    status: keyMarketReadback.status === "available"
      || boardReadback.status === "available"
      || pnlReadback.status === "available"
      ? "available"
      : "configured",
    keyMarket: keyMarketReadback,
    board: boardReadback,
    pnl: pnlReadback,
  };
}

async function readBackendDiscoveryAgents(): Promise<{
  status: "available" | "unavailable";
  agents: CuratedAgentConfig[];
  error?: string;
}> {
  try {
    const data = await withTimeout(
      fetchBackendJson<{ boards?: unknown[] }>("/boards"),
      discoveryReadbackTimeoutMs(),
      "Backend agent discovery timed out",
    );
    const agents = Array.isArray(data.boards)
      ? data.boards.map(agentConfigFromBoard).filter((agent): agent is CuratedAgentConfig => agent !== null)
      : [];
    return { status: "available", agents };
  } catch (error) {
    return {
      status: "unavailable",
      agents: [],
      error: error instanceof Error ? error.message : "Backend agent discovery failed",
    };
  }
}

function agentConfigFromBoard(value: unknown): CuratedAgentConfig | null {
  if (!value || typeof value !== "object") return null;

  const board = value as Record<string, unknown>;
  const id = stringField(board, "agent_id") ?? stringField(board, "agentId");
  const boardId = stringField(board, "id") ?? stringField(board, "board_id") ?? stringField(board, "boardId");
  if (!id || !boardId) return null;

  const metadata = metadataRecord(board);
  const chain = stringField(board, "chain");
  const venue = stringField(board, "venue_namespace");
  const name = metadataString(metadata, ["name", "agent_name", "display_name"]) ?? id;

  return {
    id,
    boardId,
    name,
    initials: metadataString(metadata, ["initials"]) ?? initialsFor(name),
    bannerUrl: metadataString(metadata, ["banner_url", "bannerUrl", "profile_banner_url", "profileBannerUrl"])
      ?? DEFAULT_AGENT_BANNER_URL,
    strategy: metadataString(metadata, ["strategy", "strategy_summary", "trading_strategy"])
      ?? `${id} / ${venue ?? chain ?? "public agent board"}`,
    description: metadataString(metadata, ["description", "agent_description", "bio"])
      ?? "Discovered from public Agent Board Ledger data.",
    gate: metadataString(metadata, ["gate"]) ?? "1 key",
    source: "AGENT_BOARD_LEDGER_DISCOVERY",
  };
}

function parseCuratedAgentIds(value: string | undefined) {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const [id, boardId] = item.split(":");
      return agentConfig(id, boardId || id, "CLAWHOUSE_CURATED_AGENT_IDS");
    });
}

function agentConfig(id: string, boardId: string, source: string): CuratedAgentConfig {
  return {
    id,
    boardId,
    name: id,
    initials: initialsFor(id),
    bannerUrl: DEFAULT_AGENT_BANNER_URL,
    strategy: `${id} / configured key-market agent`,
    description: "Reads key-market and backend ledger data from live APIs only.",
    gate: "1 key",
    source,
  };
}

function metadataRecord(board: Record<string, unknown>) {
  const metadata = board.metadata;
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    return metadata as Record<string, unknown>;
  }

  const metadataJson = stringField(board, "metadata_json");
  if (!metadataJson) return null;
  try {
    const parsed = JSON.parse(metadataJson) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function metadataString(metadata: Record<string, unknown> | null, keys: string[]) {
  if (!metadata) return null;
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return null;
}

function stringField(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function settledReadback<T>(
  result: PromiseSettledResult<T>,
  mapData: (value: T) => unknown,
): DiscoveryReadback {
  if (result.status === "fulfilled") {
    return {
      status: "available",
      data: mapData(result.value),
    };
  }

  return {
    status: "unavailable",
    error: result.reason instanceof Error ? result.reason.message : "Readback failed",
  };
}

function publicKeyMarketConfig() {
  const { networkId, contractId, defaultAgentId } = getKeyMarketConfig();
  return {
    networkId,
    contractId,
    defaultAgentId,
  };
}

function discoveryReadbackTimeoutMs() {
  const raw = Number(process.env.CLAWHOUSE_DISCOVERY_READBACK_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 5_000;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout>;
  const timer = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timer]).finally(() => clearTimeout(timeout));
}

function initialsFor(value: string) {
  const parts = value.split(/[_\-.]+/).filter(Boolean);
  const initials = parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
  return initials || value.slice(0, 2).toUpperCase() || "AG";
}
