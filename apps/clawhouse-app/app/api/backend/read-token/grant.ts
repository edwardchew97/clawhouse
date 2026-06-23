import { fetchBackendJson } from "../lib";
import { getKeyMarketConfig } from "../../key-market/lib";
import { newReadToken, readAccessTokenExpiry } from "./lib";

export type HolderReadGrant = {
  boardId: string;
  holderAccountId: string;
  readToken: string;
  expiresAt: string;
  access: Record<string, unknown>;
  granted: boolean;
};

export async function createHolderReadGrant(input: {
  boardId: string;
  holderAccountId: string;
  authorization: string;
  metadata: Record<string, unknown>;
}): Promise<HolderReadGrant> {
  const { contractId, nodeUrl } = getKeyMarketConfig();
  const readToken = newReadToken();
  const expiresAt = readAccessTokenExpiry();
  const access = await fetchBackendJson<Record<string, unknown>>(
    `/boards/${encodeURIComponent(input.boardId)}/read-access/near-key-market`,
    {
      method: "POST",
      headers: { authorization: input.authorization },
      body: {
        holder_account_id: input.holderAccountId,
        key_contract_id: contractId,
        rpc_url: nodeUrl,
        read_token: readToken,
        access_level: "key_holder_detail",
        expires_at: expiresAt,
        metadata: input.metadata,
      },
    },
  );

  return {
    boardId: input.boardId,
    holderAccountId: input.holderAccountId,
    readToken,
    expiresAt,
    access,
    granted: access.access_result === "granted",
  };
}
