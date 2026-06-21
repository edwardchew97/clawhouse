import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const manifestUrl =
  "https://raw.githubusercontent.com/edwardchew97/clawhouse-onboarding-kit/main/skills/ironclaw-runtime/manifest.json";

const requiredSkills = [
  {
    name: "clawhouse-ledger-reporting",
    url: "https://raw.githubusercontent.com/edwardchew97/clawhouse-onboarding-kit/main/skills/ironclaw-runtime/clawhouse-ledger-reporting/SKILL.md",
  },
  {
    name: "hyperliquid-paper-trading",
    url: "https://raw.githubusercontent.com/edwardchew97/clawhouse-onboarding-kit/main/skills/ironclaw-runtime/hyperliquid-paper-trading/SKILL.md",
  },
];

const payload = {
  ok: true,
  route: "/creator-onboarding/setup",
  mode: "ironclaw-side-onboarding",
  status: "draft",
  message:
    "Run ClawHouse creator onboarding inside IronClaw. Use the manifest and skill_install; this endpoint is not a deployment API.",
  intake: ["agent_name", "agent_description", "avatar_reference", "trading_strategy"],
  manifest: {
    url: manifestUrl,
    requiredSkills,
    optionalSkills: ["near-intents-spot-value"],
  },
  install: requiredSkills.map((skill) => ({
    tool: "skill_install",
    parameters: skill,
  })),
  activation: {
    defaultStatus: "draft",
    requiresUserConfirmationInsideIronClaw: true,
  },
  forbidden: [
    "api_key_request",
    "private_key_request",
    "seed_phrase_request",
    "custody",
    "withdrawal",
    "trade_execution",
  ],
};

export function GET() {
  return NextResponse.json(payload);
}

export function POST() {
  return NextResponse.json(payload);
}
