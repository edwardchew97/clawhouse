import { NextResponse } from "next/server";
import { backendError, fetchBackendJson, publicBackendConfig } from "../lib";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const health = await fetchBackendJson("/health");
    return NextResponse.json({
      ok: true,
      config: publicBackendConfig(),
      health,
    });
  } catch (error) {
    return backendError(error);
  }
}
