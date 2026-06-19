import {
  callFunction,
  formatTransactionResult,
  parseNearAmount,
  printJson,
  requiredArg,
} from "./lib/near";

const agentId = requiredArg("agent_id", 2);
const amount = requiredArg("amount", 3);
const minPayoutNear = requiredArg("min_payout_near", 4);

const result = await callFunction("sell_key", {
  agent_id: agentId,
  amount,
  min_payout: parseNearAmount(minPayoutNear),
});

printJson(
  formatTransactionResult("sell_key", result, {
    agentId,
    amount,
    minPayoutNear,
  }),
);
