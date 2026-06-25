import { printJson, readEnv } from "./lib/near";
import { preflightKeyMarketContract } from "./lib/preflight";

const missingAgentId = process.argv[2] ?? `clawhouse-preflight-${Date.now()}`;
const preflightMethod = process.argv[3] ?? "get_agent";

const env = readEnv();
const result = await preflightKeyMarketContract(fetch, {
  rpcUrl: env.nodeUrl,
  contractId: env.contractId,
  preflightMethod,
  missingAgentId,
});

printJson(result);
