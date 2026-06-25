import { strict as assert } from "node:assert";
import { GET } from "../app/api/backend/board/route.ts";
import { paperAccountIdForBoard } from "../app/api/backend/board/paper-activity.ts";

assert.equal(
  paperAccountIdForBoard(
    { id: "board-1", agent_id: "agent-1" },
    {
      leaderboard: [
        { paper_account_id: "paper-other", agent_id: "agent-other" },
        { paper_account_id: "paper-1", agent_id: "agent-1" },
      ],
    },
    "board-1",
  ),
  "paper-1",
);

assert.equal(
  paperAccountIdForBoard(
    { id: "board-1", agent_id: "agent-1" },
    {
      leaderboard: [
        { paper_account_id: "paper-1", agent_id: "agent-1" },
        { paper_account_id: "paper-2", agent_id: "agent-1" },
      ],
    },
    "board-1",
  ),
  null,
);

assert.equal(
  paperAccountIdForBoard(
    null,
    { leaderboard: [{ paper_account_id: "paper-1", agent_id: "agent-1" }] },
    "board-1",
  ),
  null,
);

const originalFetch = globalThis.fetch;
process.env.CLAWHOUSE_AGENT_API_BASE_URL = "http://ledger.test";
process.env.CLAWHOUSE_LEDGER_ADMIN_TOKEN = "test-admin-token";

const fetchCalls = [];
globalThis.fetch = async (url, options = {}) => {
  const parsed = new URL(String(url));
  const headers = new Headers(options.headers);
  fetchCalls.push({ path: parsed.pathname + parsed.search, authorization: headers.get("authorization") });

  if (parsed.pathname === "/boards/board_hermes") {
    return jsonResponse({ id: "board_hermes", agent_id: "jys-hermes" });
  }
  if (parsed.pathname === "/paper/leaderboard") {
    return jsonResponse({
      ok: true,
      leaderboard: [
        { paper_account_id: "paper_hermes", agent_id: "jys-hermes" },
      ],
    });
  }
  if (parsed.pathname === "/paper/accounts/paper_hermes/activity") {
    assert.equal(headers.get("authorization"), "Bearer test-admin-token");
    assert.equal(headers.get("x-clawhouse-read-token"), null);
    return jsonResponse({ ok: true, account: { id: "paper_hermes", agent_id: "jys-hermes" }, orders: [{ id: "paper_order_1" }], fills: [], risk_snapshots: [] });
  }
  return jsonResponse({ error: "Read access required" }, { status: 403 });
};

try {
  const response = await GET(new Request("http://app.test/api/backend/board?boardId=board_hermes"));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.paperActivity?.orders?.[0]?.id, "paper_order_1");
  assert.equal(body.errors.paperActivity, null);
  assert(fetchCalls.some((call) => call.path === "/paper/accounts/paper_hermes/activity?limit=240" && call.authorization === "Bearer test-admin-token"));
} finally {
  globalThis.fetch = originalFetch;
}

console.log("backend board paper activity resolver harness passed");

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json" },
  });
}
