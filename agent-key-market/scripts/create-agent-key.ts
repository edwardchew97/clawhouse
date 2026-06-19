import {
  callFunction,
  formatTransactionResult,
  parseNearAmount,
  printJson,
  requiredArg,
} from "./lib/near";

const agentId = requiredArg("agent_id", 2);
const name = requiredArg("name", 3);
const metadataUri = process.argv[4] ?? "";
const storageDeposit = process.argv[5] ?? process.env.STORAGE_DEPOSIT ?? "1";

const result = await callFunction(
  "create_agent_key",
  {
    agent_id: agentId,
    name,
    metadata_uri: metadataUri,
  },
  parseNearAmount(storageDeposit),
);

printJson(
  formatTransactionResult("create_agent_key", result, {
    agentId,
    name,
    metadataUri,
  }),
);
