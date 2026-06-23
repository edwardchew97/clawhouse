import { strict as assert } from "node:assert";
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

console.log("backend board paper activity resolver harness passed");
