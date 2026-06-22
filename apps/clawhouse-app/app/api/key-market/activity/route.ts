import { NextResponse } from "next/server";
import { backendError, fetchBackendJson } from "../../backend/lib";
import { requireAgentId, routeError } from "../lib";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const agentId = requireAgentId(searchParams.get("agentId"));
    const limit = searchParams.get("limit");
    const params = new URLSearchParams({ agentId });
    if (limit) params.set("limit", limit);
    return NextResponse.json(await fetchBackendJson(`/key-market/trades?${params.toString()}`));
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    return NextResponse.json(
      await fetchBackendJson("/key-market/trades/report", {
        method: "POST",
        body,
      }),
      { status: 201 },
    );
  } catch (error) {
    return backendError(error);
  }
}
