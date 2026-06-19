import {
  callFunction,
  formatTransactionResult,
  parseNearAmount,
  printJson,
  requiredArg,
  viewFunction,
} from "./lib/near";

type Quote = {
  total_cost: string;
};

const agentId = requiredArg("agent_id", 2);
const amount = requiredArg("amount", 3);
const maxPriceNear = requiredArg("max_price_near", 4);
const storageDepositNear = process.argv[5] ?? process.env.STORAGE_DEPOSIT ?? "0.2";

const quote = await viewFunction<Quote>("get_buy_price", {
  agent_id: agentId,
  amount,
});
const maxPrice = parseNearAmount(maxPriceNear);
const storageDeposit = parseNearAmount(storageDepositNear);
const attachedDeposit = (BigInt(maxPrice) + BigInt(storageDeposit)).toString();

if (BigInt(quote.total_cost) > BigInt(maxPrice)) {
  throw new Error("Current total cost is already above max_price_near");
}

const result = await callFunction(
  "buy_key",
  {
    agent_id: agentId,
    amount,
    max_price: maxPrice,
  },
  attachedDeposit,
);

printJson(
  formatTransactionResult("buy_key", result, {
    agentId,
    amount,
    maxPriceNear,
  }),
);
