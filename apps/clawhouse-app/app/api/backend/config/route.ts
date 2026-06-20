import { NextResponse } from "next/server";
import { publicBackendConfig } from "../lib";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    ok: true,
    config: publicBackendConfig(),
  });
}
