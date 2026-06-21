import { NextResponse } from "next/server";
import { backendError, fetchBackendJson, publicBackendConfig } from "../lib";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const paperLeaderboard = await fetchBackendJson("/paper/leaderboard");
    return NextResponse.json({
      ok: true,
      config: publicBackendConfig(),
      paperLeaderboard,
    });
  } catch (error) {
    return backendError(error);
  }
}
