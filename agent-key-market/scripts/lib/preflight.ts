export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type ContractPreflightInput = {
  rpcUrl: string;
  contractId: string;
  preflightMethod: string;
  missingAgentId: string;
  finality?: string;
};

export async function preflightKeyMarketContract(fetchLike: FetchLike, input: ContractPreflightInput) {
  const finality = input.finality ?? "final";
  await rpcQuery(fetchLike, input.rpcUrl, {
    request_type: "view_account",
    finality,
    account_id: input.contractId,
  }, "view_account");

  const code = await rpcQuery(fetchLike, input.rpcUrl, {
    request_type: "view_code",
    finality,
    account_id: input.contractId,
  }, "view_code");
  if (typeof code.code_base64 !== "string") {
    throw new ContractPreflightError("CONTRACT_CODE_MISSING", "Contract code response is missing code_base64");
  }

  const result = await rpcQuery(fetchLike, input.rpcUrl, {
    request_type: "call_function",
    finality,
    account_id: input.contractId,
    method_name: input.preflightMethod,
    args_base64: Buffer.from(JSON.stringify({ agent_id: input.missingAgentId })).toString("base64"),
  }, "call_function");
  const value = decodeCallResult(result.result);
  if (value !== null) {
    throw new ContractPreflightError("CONTRACT_PREFLIGHT_UNEXPECTED_RESULT", "Missing agent preflight must return null");
  }

  return {
    ok: true,
    contract_id: input.contractId,
    preflight_method: input.preflightMethod,
    missing_agent_result: value,
  };
}

type QueryPhase = "view_account" | "view_code" | "call_function";

async function rpcQuery(fetchLike: FetchLike, rpcUrl: string, params: Record<string, unknown>, phase: QueryPhase) {
  const response = await fetchLike(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "clawhouse-key-market-preflight",
      method: "query",
      params,
    }),
  });
  const payload = await response.json().catch(() => null) as { result?: unknown; error?: unknown } | null;
  if (!response.ok) {
    throw new ContractPreflightError("RPC_ERROR", `RPC returned HTTP ${response.status}`);
  }
  if (!payload || typeof payload !== "object") {
    throw new ContractPreflightError("INVALID_RPC_JSON", "RPC returned invalid JSON");
  }
  if (payload.error) {
    throw classifyRpcError(payload.error, phase);
  }
  if (!payload.result || typeof payload.result !== "object") {
    throw new ContractPreflightError("INVALID_RPC_JSON", "RPC response is missing result");
  }
  return payload.result as Record<string, unknown>;
}

function classifyRpcError(error: unknown, phase: QueryPhase) {
  const message = stringifyRpcError(error);
  const fingerprint = errorFingerprint(error);
  if (isMissingAccountError(fingerprint)) {
    return new ContractPreflightError("CONTRACT_ACCOUNT_NOT_FOUND", message);
  }
  if (phase !== "view_account" && isMissingCodeError(fingerprint)) {
    return new ContractPreflightError("CONTRACT_CODE_MISSING", message);
  }
  if (phase === "call_function" && isMissingMethodError(fingerprint)) {
    return new ContractPreflightError("CONTRACT_METHOD_UNAVAILABLE", message);
  }
  return new ContractPreflightError("RPC_ERROR", message);
}

function errorFingerprint(value: unknown): string {
  const parts: string[] = [];
  collectErrorParts(value, parts);
  return parts.join(" ").toUpperCase();
}

function collectErrorParts(value: unknown, parts: string[]) {
  if (typeof value === "string") {
    parts.push(value);
    return;
  }
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) collectErrorParts(item, parts);
    return;
  }

  const record = value as Record<string, unknown>;
  for (const key of ["name", "kind", "message", "error_message", "error_type"]) {
    const item = record[key];
    if (typeof item === "string") parts.push(item);
  }
  for (const key of ["cause", "info", "data"]) {
    collectErrorParts(record[key], parts);
  }
}

function stringifyRpcError(error: unknown) {
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function isMissingAccountError(fingerprint: string) {
  return /\bUNKNOWN_ACCOUNT\b/.test(fingerprint)
    || /\bUNKNOWN_ACCOUNT_ID\b/.test(fingerprint)
    || /\bACCOUNT_DOES_NOT_EXIST\b/.test(fingerprint)
    || /\bACCOUNT DOES NOT EXIST\b/.test(fingerprint);
}

function isMissingCodeError(fingerprint: string) {
  return /\bNO_CONTRACT_CODE\b/.test(fingerprint)
    || /\bCONTRACT_CODE_MISSING\b/.test(fingerprint)
    || /\bCODE DOES NOT EXIST\b/.test(fingerprint)
    || /\bWASM CODE IS EMPTY\b/.test(fingerprint);
}

function isMissingMethodError(fingerprint: string) {
  return /\bMETHOD_NOT_FOUND\b/.test(fingerprint)
    || /\bMETHOD_RESOLVE_ERROR\b/.test(fingerprint)
    || /\bMETHOD NOT FOUND\b/.test(fingerprint)
    || /\bFUNCTION CALL METHOD .* IS NOT FOUND\b/.test(fingerprint);
}

function decodeCallResult(value: unknown) {
  if (!Array.isArray(value)) {
    throw new ContractPreflightError("INVALID_RPC_JSON", "call_function response is missing result bytes");
  }
  const text = Buffer.from(value as number[]).toString("utf8");
  try {
    return JSON.parse(text);
  } catch {
    throw new ContractPreflightError("INVALID_RPC_JSON", "call_function result is not JSON");
  }
}

export class ContractPreflightError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}
