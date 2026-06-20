import { NextResponse } from "next/server";
import { getKeyMarketConfig } from "../lib";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    ok: true,
    config: getKeyMarketConfig(),
  });
}
