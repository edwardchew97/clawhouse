import { NextResponse } from "next/server";
import { readAgentDiscovery } from "./lib";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await readAgentDiscovery());
}
