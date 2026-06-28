import { describe, expect, test } from "bun:test";
import { DEFAULT_AGENT_BANNER_URL, normalizeDiscoveryAgent } from "../app/lib/discovery";

describe("normalizeDiscoveryAgent", () => {
  test("derives display fields and key-market status from the raw agent", () => {
    const agent = normalizeDiscoveryAgent({
      id: "claw_agent_01",
      name: "claw_agent_01",
      keyMarket: { status: "available", data: { agent: { agent_id: "claw_agent_01", supply: "8" } } },
      pnl: { data: { latest: { total_pnl_pct: -0.4012 } } },
    }, 0);

    expect(agent.id).toBe("claw_agent_01");
    expect(agent.displayName).toBe("Claw Agent"); // "01" dropped as a machine token
    expect(agent.initials).toBe("C"); // initialsFor splits on _-. only, not spaces
    expect(agent.holders).toBe(8);
    expect(agent.keyMarketStatus).toBe("available");
    expect(agent.keyMarketAgentId).toBe("claw_agent_01");
    expect(agent.pnl).toBeCloseTo(-40.12, 4); // fractional percent normalized
    expect(agent.bannerUrl).toBe(DEFAULT_AGENT_BANNER_URL);
    expect(agent.boardId).toBe("claw_agent_01");
  });

  test("keeps human display names verbatim and falls back to generated ids", () => {
    expect(normalizeDiscoveryAgent({ id: "x", name: "SAND Downside Hunter" }).displayName).toBe("SAND Downside Hunter");
    const fallback = normalizeDiscoveryAgent({}, 4);
    expect(fallback.id).toBe("agent_5");
    expect(fallback.keyMarketStatus).toBe("unknown");
    expect(fallback.last).toBe("checking");
  });
});
