import { describe, expect, test } from "bun:test";
import { initialChainState } from "../app/store/key-market-store";
import type { DemoChainState, LegacyAgent } from "../app/lib/key-market-types";
import {
  agentKey,
  backendNetwork,
  backendPnl,
  chainApplies,
  holderBalance,
  holderCount,
  isPaperAgent,
  isUnlocked,
  keyActivityRows,
  keyMarketUnavailable,
  roomAccessLoading,
  selectAgent,
} from "../app/lib/key-market-selectors";

const agent: LegacyAgent = { id: "agent-1", name: "Agent One", boardId: "board-1", holders: 7 };
function ctx(chain: Partial<DemoChainState> = {}) {
  return { chain: { ...initialChainState, ...chain }, agents: [agent], tradeSide: "buy" as const };
}

describe("agent identity + selection", () => {
  test("agentKey prefers boardId; selectAgent resolves by key then id then first", () => {
    expect(agentKey(agent)).toBe("board-1");
    expect(selectAgent([agent], "board-1")?.id).toBe("agent-1");
    expect(selectAgent([agent], "agent-1")?.id).toBe("agent-1"); // by id fallback
    expect(selectAgent([agent], "missing")?.id).toBe("agent-1"); // first fallback
    expect(selectAgent([], "x")).toBeNull();
  });
});

describe("chain-applies gated derivation", () => {
  test("holderBalance/holderCount switch to live chain values only when chain applies", () => {
    expect(chainApplies(ctx(), agent)).toBe(false);
    expect(holderCount(ctx(), agent)).toBe(7); // falls back to agent.holders
    const live = ctx({ state: { agent: { agent_id: "agent-1", supply: "12" }, holder_balance: "3" } });
    expect(chainApplies(live, agent)).toBe(true);
    expect(holderCount(live, agent)).toBe(12); // live supply wins
    expect(holderBalance(live, agent)).toBe(3);
  });

  test("keyMarketUnavailable detects readback status and contract errors", () => {
    expect(keyMarketUnavailable(ctx(), { ...agent, keyMarketStatus: "unavailable" })).toBe(true);
    expect(keyMarketUnavailable(ctx({ error: "Agent key market does not exist" }), agent)).toBe(true);
    expect(keyMarketUnavailable(ctx({ error: "transient" }), agent)).toBe(false);
  });

  test("backendPnl prefers paper leaderboard, normalizing fractional percent", () => {
    const chain = ctx({
      backend: { ok: true, boardId: "board-1", board: { id: "board-1" }, paperLeaderboard: { leaderboard: [{ paper_account_id: "board-1", paper_pnl_pct: -0.4012 }] } },
    });
    expect(backendPnl(chain, agent)).toBeCloseTo(-40.12, 4);
  });
});

describe("backend network + access state", () => {
  test("isPaperAgent + backendNetwork classify paper agents as hyperliquid", () => {
    const paper: LegacyAgent = { id: "p1", name: "Paper Hunter", boardId: "b1" };
    const lb = ctx({ backend: { ok: true, boardId: "b1", board: { id: "b1" }, paperLeaderboard: { leaderboard: [{ paper_account_id: "b1", equity_usd: 100 }] } } });
    const pctx = { ...lb, agents: [paper] };
    expect(isPaperAgent(pctx, paper)).toBe(true);
    expect(backendNetwork(pctx, paper)).toBe("hyperliquid");
    // non-paper falls back to metadata/near
    const plain: LegacyAgent = { id: "x", name: "Plain", boardId: "bx" };
    expect(backendNetwork(ctx(), plain)).toBe("near");
  });

  test("isUnlocked requires wallet + valid read access; roomAccessLoading reflects pending reads", () => {
    expect(isUnlocked(ctx(), agent)).toBe(false); // no wallet
    const future = new Date(Date.now() + 60_000).toISOString();
    const unlocked = ctx({
      accountId: "me.testnet",
      readAccess: { boardId: "board-1", holderAccountId: "me.testnet", expiresAt: future },
      backend: { ok: true, boardId: "board-1", board: { id: "board-1" } },
    });
    expect(isUnlocked(unlocked, agent)).toBe(true);
    expect(roomAccessLoading(unlocked, agent)).toBe(false); // access already applies
    const loading = ctx({ accountId: "me.testnet", readAccessLoading: true });
    expect(roomAccessLoading(loading, agent)).toBe(true);
  });
});

describe("key activity rows", () => {
  test("builds buy/sell rows with labels, trader + explorer urls", () => {
    const chain = ctx({
      activity: {
        agent_id: "agent-1",
        trades: [
          { side: "buy", amount: "2", trader_id: "buyer.testnet", total_cost: "5000000000000000000000000", tx_hash: "HASH1", network_id: "testnet" },
          { side: "sell", amount: "1", trader_id: "seller.testnet", payout: "1000000000000000000000000", tx_hash: "HASH2", network_id: "mainnet" },
        ],
      },
    });
    const rows = keyActivityRows(chain, agent);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ title: "Buy", amountLabel: "2 keys", tone: "buy", side: "5.00 tNEAR" });
    expect(rows[0].traderUrl).toBe("https://testnet.nearblocks.io/address/buyer.testnet");
    expect(rows[0].linkUrl).toBe("https://testnet.nearblocks.io/txns/HASH1");
    expect(rows[1]).toMatchObject({ title: "Sell", amountLabel: "1 key", tone: "sell", side: "1.00 tNEAR" });
    expect(rows[1].linkUrl).toBe("https://nearblocks.io/txns/HASH2");
  });

  test("ignores activity for a different agent", () => {
    const chain = ctx({ activity: { agent_id: "other", trades: [{ side: "buy", amount: "1" }] } });
    expect(keyActivityRows(chain, agent)).toEqual([]);
  });
});
