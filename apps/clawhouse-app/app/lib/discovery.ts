/**
 * Discovery agent normalization, ported legacy-exact from the
 * `normalizeDiscoveryAgent` block in `public/clawhouse-fomo-layout.js`.
 * Pure + typed; the fetch lives in the market-data controller.
 */

import { asNumber, normalizePct, shortHash } from "./key-market-format";
import type { LegacyAgent } from "./key-market-types";

export const DEFAULT_AGENT_BANNER_URL = "/agent-banners/default-agent-banner.png";

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (v && typeof v === "object" ? (v as Rec) : {});

function initialsFor(value: string) {
  const parts = String(value || "").split(/[_\-.]+/).filter(Boolean);
  const initials = parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
  return initials || String(value || "AG").slice(0, 2).toUpperCase();
}

function splitLettersAndNumbers(value: string) {
  return String(value || "").match(/[a-z]*\d+[a-z]*|[a-z]+|\d+/gi) ?? [];
}

function isMachineToken(value: string) {
  const token = String(value || "").toLowerCase();
  if (/^\d+$/.test(token)) return true;
  if (/^20\d{6,}/.test(token)) return true;
  if (/^\d{6,}t?\d*z?$/.test(token)) return true;
  if (/^[a-f0-9]{4,}$/.test(token) && /[a-f]/.test(token) && /\d/.test(token)) return true;
  return false;
}

const ACRONYMS: Record<string, string> = {
  ai: "AI", api: "API", cm: "CM", e2e: "E2E", ft: "FT", id: "ID", ll: "LL", near: "NEAR", pnl: "P&L", tc: "TC",
};

function titleWord(value: string) {
  const token = String(value || "").toLowerCase();
  if (ACRONYMS[token]) return ACRONYMS[token];
  if (token === "clawhouse") return "ClawHouse";
  if (token === "ironclaw") return "IronClaw";
  return `${token.charAt(0).toUpperCase()}${token.slice(1)}`;
}

function displayNameForAgent(name: string, id: string) {
  const value = String(name || id || "Agent").trim();
  if (!value) return "Agent";
  if (value !== id) return value;
  const words = value
    .split(/[\s_\-./]+/g)
    .flatMap(splitLettersAndNumbers)
    .filter((word) => word && !isMachineToken(word))
    .map(titleWord);
  return words.length ? words.join(" ") : shortHash(value);
}

export function normalizeDiscoveryAgent(agent: Rec = {}, index = 0): LegacyAgent {
  const keyStateAgent = rec(rec(rec(agent.keyMarket).data).agent);
  const pnlLatest = rec(rec(rec(agent.pnl).data).latest);
  const id = String(agent.id || keyStateAgent.agent_id || `agent_${index + 1}`);
  const name = String(agent.name || keyStateAgent.name || id);
  const displayName = displayNameForAgent(name, id);
  return {
    id,
    name,
    displayName,
    initials: (agent.initials as string) || initialsFor(displayName),
    color: "#3c4044",
    bannerUrl: (agent.bannerUrl as string) || (agent.banner_url as string) || DEFAULT_AGENT_BANNER_URL,
    strategy: (agent.strategy as string) || `${id} / key-market and paper trading agent`,
    desc: (agent.description as string) || "Reads key-market, backend ledger, and paper-trading data from live APIs only.",
    holders: asNumber(keyStateAgent.supply),
    gate: (agent.gate as string) || "open",
    last: agent.status === "available" ? "live read" : "checking",
    boardId: (agent.boardId as string) || (agent.board_id as string) || id,
    keyMarketStatus: (rec(agent.keyMarket).status as string) || "unknown",
    keyMarketAgentId: (keyStateAgent.agent_id as string) || null,
    pnl: normalizePct(pnlLatest.total_pnl_pct),
    discoveryIndex: index,
  };
}
