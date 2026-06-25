import {
  callFunction,
  formatTransactionResult,
  parseNearAmount,
  printJson,
  requiredArg,
  viewFunction,
} from "./lib/near";

const agentId = requiredArg("agent_id", 2);
const name = requiredArg("name", 3);
const metadataUri = process.argv[4] ?? "";
const storageDeposit = process.argv[5] ?? process.env.STORAGE_DEPOSIT ?? "0.05";

const existing = await viewFunction<Record<string, unknown> | null>("get_agent", {
  agent_id: agentId,
});

if (existing) {
  printJson({
    ok: false,
    error: `Agent key market already exists: ${agentId}`,
    agentId,
    existing,
    nextStep:
      "Use a new agentId for create, or skip create and continue from quote buy.",
  });
  process.exit(1);
}

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
