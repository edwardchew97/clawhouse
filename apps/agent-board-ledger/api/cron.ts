import { handleVercelLedgerRequest } from "../src/vercel";

export const maxDuration = 60;

export function GET(request: Request) {
  return handleVercelLedgerRequest(request);
}
