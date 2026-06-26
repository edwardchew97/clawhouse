import { describe, expect, test } from "bun:test";
import { initialChainState } from "../app/store/key-market-store";
import type { DemoChainState, LegacyAgent } from "../app/lib/key-market-types";
import {
  agentKey,
  backendPnl,
  chainApplies,
  holderBalance,
  holderCount,
  keyActivityRows,
  keyMarketUnavailable,
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
