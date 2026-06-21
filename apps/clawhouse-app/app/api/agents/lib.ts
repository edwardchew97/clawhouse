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
  strategy: string;
  description: string;
  gate: string;
  source: string;
};

export type DiscoveryAgent = CuratedAgentConfig & {
  status: "available" | "configured";
  keyMarket: DiscoveryReadback;
  board: DiscoveryReadback;
};

type DiscoveryReadback = {
  status: "available" | "unavailable";
  data?: unknown;
  error?: string;
};

export async function readAgentDiscovery() {
  const agents = await Promise.all(getCuratedAgents().map(readDiscoveryAgent));
  return {
    ok: true,
    mode: "curated",
    count: agents.length,
    config: {
      keyMarket: publicKeyMarketConfig(),
      backend: publicBackendConfig(),
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
  const [keyMarket, board] = await Promise.allSettled([
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
  ]);

  const keyMarketReadback = settledReadback(keyMarket, (state) => formatState(state));
  const boardReadback = settledReadback(board, (data) => data);

  return {
    ...agent,
    status: keyMarketReadback.status === "available" || boardReadback.status === "available"
      ? "available"
      : "configured",
    keyMarket: keyMarketReadback,
    board: boardReadback,
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
    strategy: `${id} / configured key-market agent`,
    description: "Reads key-market and backend ledger data from live APIs only.",
    gate: "1 key",
    source,
  };
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
