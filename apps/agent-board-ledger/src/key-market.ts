import { cleanString, newId, requiredString, RequestError, type LedgerDb } from "./db.js";
import type { JsonObject, KeyMarketTradeRow } from "./types.js";

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
type RuntimeEnv = Record<string, string | undefined>;
type BodyResultLike = { json: unknown };

const defaultNetworkId = "testnet";
const defaultContractId = "clawhouse-key-20260619125948.testnet";
const defaultRpcUrls: Record<string, string> = {
  testnet: "https://rpc.testnet.fastnear.com",
  mainnet: "https://rpc.mainnet.fastnear.com",
};

export async function listKeyMarketTrades(db: LedgerDb, env: RuntimeEnv, searchParams: URLSearchParams) {
  const agentId = cleanString(searchParams.get("agentId") ?? searchParams.get("agent_id"));
  const limit = boundedLimit(searchParams.get("limit"));
  const config = keyMarketConfig(env);
  const where = ["network_id = ?", "contract_id = ?"];
  const params: unknown[] = [config.networkId, config.contractId];

  if (agentId) {
    where.push("agent_id = ?");
    params.push(agentId);
  }
  params.push(limit);

  const trades = await db.all<KeyMarketTradeRow>(
    `SELECT * FROM key_market_trades
      WHERE ${where.join(" AND ")}
      ORDER BY created_at DESC, id DESC
      LIMIT ?`,
    params,
  );

  return {
    ok: true,
    network_id: config.networkId,
    contract_id: config.contractId,
    agent_id: agentId,
    count: trades.length,
    trades: trades.map(presentKeyMarketTrade),
  };
}

export async function reportKeyMarketTrade(
  db: LedgerDb,
  rpcFetch: FetchLike,
  env: RuntimeEnv,
  body: BodyResultLike,
  createdAt: string,
) {
  const data = asObject(body.json);
  const txHash = requiredString(data.txHash ?? data.tx_hash, "tx_hash");
  const signerId = requiredString(data.signerId ?? data.signer_id ?? data.accountId ?? data.account_id, "signer_id");
  const expected = {
    agentId: cleanString(data.agentId ?? data.agent_id),
    side: normalizeSide(data.side),
    amount: integerString(data.amount, "amount", false),
  };
  const config = keyMarketConfig(env);
  assertReportedKeyMarketConfig(data, config);
  const txStatus = await fetchNearTxStatus(rpcFetch, config.rpcUrl, txHash, signerId);
  const verified = verifyKeyMarketTx(txStatus, {
    txHash,
    signerId,
    contractId: config.contractId,
    expected,
  });
  const existing = await db.get<KeyMarketTradeRow>(
    "SELECT * FROM key_market_trades WHERE network_id = ? AND tx_hash = ?",
    [config.networkId, txHash],
  );
  const row: KeyMarketTradeRow = {
    id: existing?.id ?? newId("keytrade"),
    network_id: config.networkId,
    contract_id: config.contractId,
    agent_id: verified.agent_id,
    trader_id: verified.trader_id,
    side: verified.side,
    amount: verified.amount,
    tx_hash: txHash,
    receipt_id: verified.receipt_id,
    block_hash: verified.block_hash,
    block_height: verified.block_height,
    supply_after: verified.supply_after,
    trader_balance_after: verified.trader_balance_after,
    reserve_after: verified.reserve_after,
    price: verified.price,
    protocol_fee: verified.protocol_fee,
    creator_fee: verified.creator_fee,
    total_cost: verified.total_cost,
    payout: verified.payout,
    source: verified.source,
    metadata_json: JSON.stringify({
      rpc_url: config.rpcUrl,
      tx_receiver_id: verified.receiver_id,
      function_method: verified.method_name,
      reported_agent_id: expected.agentId,
      reported_side: expected.side,
      reported_amount: expected.amount,
      event_log_found: verified.source === "contract_event",
    }),
    created_at: existing?.created_at ?? createdAt,
  };

  await db.run(
    `INSERT INTO key_market_trades
      (id, network_id, contract_id, agent_id, trader_id, side, amount, tx_hash,
       receipt_id, block_hash, block_height, supply_after, trader_balance_after,
       reserve_after, price, protocol_fee, creator_fee, total_cost, payout,
       source, metadata_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (network_id, tx_hash) DO UPDATE SET
        contract_id = excluded.contract_id,
        agent_id = excluded.agent_id,
        trader_id = excluded.trader_id,
        side = excluded.side,
        amount = excluded.amount,
        receipt_id = excluded.receipt_id,
        block_hash = excluded.block_hash,
        block_height = excluded.block_height,
        supply_after = excluded.supply_after,
        trader_balance_after = excluded.trader_balance_after,
        reserve_after = excluded.reserve_after,
        price = excluded.price,
        protocol_fee = excluded.protocol_fee,
        creator_fee = excluded.creator_fee,
        total_cost = excluded.total_cost,
        payout = excluded.payout,
        source = excluded.source,
        metadata_json = excluded.metadata_json`,
    [
      row.id,
      row.network_id,
      row.contract_id,
      row.agent_id,
      row.trader_id,
      row.side,
      row.amount,
      row.tx_hash,
      row.receipt_id,
      row.block_hash,
      row.block_height,
      row.supply_after,
      row.trader_balance_after,
      row.reserve_after,
      row.price,
      row.protocol_fee,
      row.creator_fee,
      row.total_cost,
      row.payout,
      row.source,
      row.metadata_json,
      row.created_at,
    ],
  );

  return {
    ok: true,
    merged: Boolean(existing),
    trade: presentKeyMarketTrade(row),
  };
}

function keyMarketConfig(env: RuntimeEnv) {
  const networkId = cleanEnv(env.CLAWHOUSE_KEY_NEAR_NETWORK_ID)
    ?? cleanEnv(env.KEY_NEAR_NETWORK_ID)
    ?? cleanEnv(env.NEAR_NETWORK_ID)
    ?? defaultNetworkId;
  const contractId = cleanEnv(env.CLAWHOUSE_KEY_MARKET_CONTRACT_ID)
    ?? cleanEnv(env.KEY_MARKET_CONTRACT_ID)
    ?? cleanEnv(env.CONTRACT_ID)
    ?? defaultContractId;
  const rpcUrl = cleanEnv(env.CLAWHOUSE_KEY_NEAR_RPC_URL)
    ?? cleanEnv(env.KEY_NEAR_RPC_URL)
    ?? cleanEnv(env.AGENT_BOARD_LEDGER_NEAR_RPC_URL)
    ?? cleanEnv(env.NEAR_NODE_URL)
    ?? defaultRpcUrls[networkId]
    ?? `https://rpc.${networkId}.near.org`;

  return { networkId, contractId, rpcUrl };
}

function assertReportedKeyMarketConfig(input: JsonObject, config: ReturnType<typeof keyMarketConfig>) {
  const reportedNetworkId = cleanString(input.networkId ?? input.network_id);
  const reportedContractId = cleanString(input.contractId ?? input.contract_id);
  if (reportedNetworkId && reportedNetworkId !== config.networkId) {
    throw new RequestError("Reported network_id does not match configured key-market network", 400);
  }
  if (reportedContractId && reportedContractId !== config.contractId) {
    throw new RequestError("Reported contract_id does not match configured key-market contract", 400);
  }
}

async function fetchNearTxStatus(rpcFetch: FetchLike, rpcUrl: string, txHash: string, signerId: string) {
  const response = await rpcFetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "clawhouse-key-market-trade",
      method: "tx",
      params: [txHash, signerId],
    }),
  });
  const payload = await response.json().catch(() => null) as unknown;
  if (!response.ok) {
    throw new RequestError(`NEAR tx lookup failed: ${response.status}`, 502);
  }
  const result = asObject(payload).result;
  const error = asObject(payload).error;
  if (error) {
    throw new RequestError(`NEAR tx lookup failed: ${JSON.stringify(error)}`, 502);
  }
  return asObject(result);
}

function verifyKeyMarketTx(
  txStatus: JsonObject,
  options: {
    txHash: string;
    signerId: string;
    contractId: string;
    expected: { agentId: string | null; side: "buy" | "sell" | null; amount: string | null };
  },
) {
  assertTxSuccess(txStatus);
  const transaction = asObject(txStatus.transaction);
  const signerId = requiredString(transaction.signer_id, "transaction.signer_id");
  const receiverId = requiredString(transaction.receiver_id, "transaction.receiver_id");
  if (signerId !== options.signerId) {
    throw new RequestError("Reported signer_id does not match transaction signer", 400);
  }
  if (receiverId !== options.contractId) {
    throw new RequestError("Transaction receiver is not the configured key-market contract", 400);
  }

  const action = keyMarketFunctionCall(transaction);
  const side = sideFromMethod(action.method_name);
  const args = decodeFunctionCallArgs(action.args);
  const result = decodeSuccessValue(txStatus);
  const event = findKeyTradeEvent(txStatus);
  const tradeData = event?.data ?? result ?? {};
  const agentId = stringField(tradeData, "agent_id") ?? stringField(args, "agent_id");
  const amount = integerString(tradeData.amount ?? args.amount, "amount", true);
  const traderId = stringField(tradeData, "trader_id") ?? signerId;
  const tradeSide = normalizeSide(tradeData.side) ?? side;

  if (!agentId) throw new RequestError("Verified key trade is missing agent_id", 502);
  if (tradeSide !== side) throw new RequestError("Verified key trade side does not match function call", 502);
  if (options.expected.agentId && agentId !== options.expected.agentId) {
    throw new RequestError("Reported agent_id does not match verified transaction", 400);
  }
  if (options.expected.side && tradeSide !== options.expected.side) {
    throw new RequestError("Reported side does not match verified transaction", 400);
  }
  if (options.expected.amount && amount !== options.expected.amount) {
    throw new RequestError("Reported amount does not match verified transaction", 400);
  }

  return {
    agent_id: agentId,
    trader_id: traderId,
    side: tradeSide,
    amount,
    receipt_id: event?.receiptId ?? firstString(txStatus.transaction_outcome, ["id"]),
    block_hash: event?.blockHash ?? firstString(txStatus.transaction_outcome, ["block_hash"]),
    block_height: event?.blockHeight ?? null,
    receiver_id: receiverId,
    method_name: action.method_name,
    supply_after: integerString(tradeData.supply_after, "supply_after", false),
    trader_balance_after: integerString(tradeData.trader_balance_after, "trader_balance_after", false),
    reserve_after: integerString(tradeData.reserve_after, "reserve_after", false),
    price: integerString(tradeData.price, "price", false),
    protocol_fee: integerString(tradeData.protocol_fee, "protocol_fee", false),
    creator_fee: integerString(tradeData.creator_fee, "creator_fee", false),
    total_cost: integerString(tradeData.total_cost, "total_cost", false),
    payout: integerString(tradeData.payout, "payout", false),
    source: event ? "contract_event" : result ? "trade_result" : "function_args",
  };
}

function assertTxSuccess(txStatus: JsonObject) {
  const status = asObject(txStatus.status);
  if ("Failure" in status) throw new RequestError("NEAR transaction failed", 400);
  if (!("SuccessValue" in status) && !("SuccessReceiptId" in status)) {
    throw new RequestError("NEAR transaction is not finalized successfully", 400);
  }
}

function keyMarketFunctionCall(transaction: JsonObject) {
  const actions = Array.isArray(transaction.actions) ? transaction.actions : [];
  for (const item of actions) {
    const action = asObject(item);
    const functionCall = asObject(action.FunctionCall ?? action.function_call);
    const methodName = cleanString(functionCall.method_name ?? functionCall.methodName);
    if (methodName === "buy_key" || methodName === "sell_key") {
      return {
        method_name: methodName,
        args: functionCall.args,
      };
    }
  }
  throw new RequestError("Transaction does not call buy_key or sell_key", 400);
}

function decodeFunctionCallArgs(value: unknown) {
  if (value && typeof value === "object") return asObject(value);
  const raw = requiredString(value, "function call args");
  try {
    return asObject(JSON.parse(Buffer.from(raw, "base64").toString("utf8")));
  } catch {
    throw new RequestError("Could not decode key-market function call args", 400);
  }
}

function decodeSuccessValue(txStatus: JsonObject) {
  const successValue = cleanString(asObject(txStatus.status).SuccessValue);
  if (!successValue) return null;
  const decoded = Buffer.from(successValue, "base64").toString("utf8");
  if (!decoded) return null;
  try {
    return asObject(JSON.parse(decoded));
  } catch {
    return null;
  }
}

function findKeyTradeEvent(txStatus: JsonObject) {
  const outcomes = [
    asObject(txStatus.transaction_outcome),
    ...arrayOfObjects(txStatus.receipts_outcome),
  ];

  for (const outcome of outcomes) {
    const logs = arrayOfStrings(asObject(outcome.outcome).logs);
    for (const log of logs) {
      if (!log.startsWith("EVENT_JSON:")) continue;
      const event = parseEventLog(log);
      if (!event || event.standard !== "clawhouse-key-market" || event.event !== "key_trade") continue;
      return {
        data: event.data,
        receiptId: firstString(outcome, ["id"]),
        blockHash: firstString(outcome, ["block_hash"]),
        blockHeight: firstString(outcome, ["block_height", "blockHeight"]),
      };
    }
  }
  return null;
}

function parseEventLog(log: string) {
  try {
    const payload = asObject(JSON.parse(log.slice("EVENT_JSON:".length)));
    const data = payload.data;
    const firstData = Array.isArray(data) ? data[0] : data;
    return {
      standard: cleanString(payload.standard),
      event: cleanString(payload.event),
      data: asObject(firstData),
    };
  } catch {
    return null;
  }
}

function presentKeyMarketTrade(row: KeyMarketTradeRow) {
  return {
    id: row.id,
    network_id: row.network_id,
    contract_id: row.contract_id,
    agent_id: row.agent_id,
    trader_id: row.trader_id,
    side: row.side,
    amount: row.amount,
    tx_hash: row.tx_hash,
    receipt_id: row.receipt_id,
    block_hash: row.block_hash,
    block_height: row.block_height,
    supply_after: row.supply_after,
    trader_balance_after: row.trader_balance_after,
    reserve_after: row.reserve_after,
    price: row.price,
    protocol_fee: row.protocol_fee,
    creator_fee: row.creator_fee,
    total_cost: row.total_cost,
    payout: row.payout,
    source: row.source,
    created_at: row.created_at,
  };
}

function sideFromMethod(methodName: string): "buy" | "sell" {
  if (methodName === "buy_key") return "buy";
  if (methodName === "sell_key") return "sell";
  throw new RequestError("Unsupported key-market method", 400);
}

function normalizeSide(value: unknown): "buy" | "sell" | null {
  const cleaned = cleanString(value);
  if (!cleaned) return null;
  if (cleaned !== "buy" && cleaned !== "sell") throw new RequestError("side must be buy or sell", 400);
  return cleaned;
}

function integerString(value: unknown, name: string, required: true): string;
function integerString(value: unknown, name: string, required: false): string | null;
function integerString(value: unknown, name: string, required: boolean) {
  if (value === undefined || value === null || value === "") {
    if (required) throw new RequestError(`Missing ${name}`, 400);
    return null;
  }
  const stringValue = typeof value === "bigint" ? value.toString() : String(value);
  if (!/^\d+$/.test(stringValue)) throw new RequestError(`Invalid ${name}`, 400);
  return stringValue;
}

function boundedLimit(value: string | null) {
  if (!value) return 20;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    throw new RequestError("Invalid limit", 400);
  }
  return parsed;
}

function stringField(record: JsonObject, key: string) {
  return cleanString(record[key]);
}

function firstString(record: unknown, keys: string[]) {
  const object = asObject(record);
  for (const key of keys) {
    const value = cleanString(object[key]);
    if (value) return value;
  }
  return null;
}

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function arrayOfObjects(value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.map(asObject) : [];
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function cleanEnv(value: string | undefined) {
  return value && value.trim() !== "" ? value.trim() : undefined;
}
