import { NextResponse } from "next/server";
import { backendError, publicBackendConfig } from "../lib";

export const dynamic = "force-dynamic";

export function GET() {
  try {
    return NextResponse.json({
      ok: true,
      config: publicBackendConfig(),
    });
  } catch (error) {
    return backendError(error);
  }
}
