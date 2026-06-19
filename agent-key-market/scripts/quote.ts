import { formatQuote, printJson, requiredArg, viewFunction } from "./lib/near";

const side = requiredArg("side", 2);
const agentId = requiredArg("agent_id", 3);
const amount = requiredArg("amount", 4);

if (side !== "buy" && side !== "sell") {
  throw new Error("side must be buy or sell");
}

const methodName = side === "buy" ? "get_buy_price" : "get_sell_price";
const quote = await viewFunction<Record<string, unknown>>(methodName, {
  agent_id: agentId,
  amount,
});

printJson(formatQuote(quote));
