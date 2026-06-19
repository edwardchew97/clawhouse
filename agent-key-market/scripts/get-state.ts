import { printJson, readEnv, requiredArg, viewFunction } from "./lib/near";

const agentId = requiredArg("agent_id", 2);
const holderId = process.argv[3] ?? readEnv().accountId;

const state = await viewFunction("get_state", {
  agent_id: agentId,
  holder_id: holderId,
});

printJson(state);
