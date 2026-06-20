import { handleVercelLedgerRequest } from "../src/vercel";

export const maxDuration = 60;

export function DELETE(request: Request) {
  return handleVercelLedgerRequest(request);
}

export function GET(request: Request) {
  return handleVercelLedgerRequest(request);
}

export function OPTIONS(request: Request) {
  return handleVercelLedgerRequest(request);
}

export function PATCH(request: Request) {
  return handleVercelLedgerRequest(request);
}

export function POST(request: Request) {
  return handleVercelLedgerRequest(request);
}

export function PUT(request: Request) {
  return handleVercelLedgerRequest(request);
}
