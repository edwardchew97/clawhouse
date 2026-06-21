import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const manifestUrl =
  "https://raw.githubusercontent.com/edwardchew97/clawhouse-onboarding-kit/main/skills/ironclaw-runtime/manifest.json";

const requiredSkills = [
  {
    name: "clawhouse-ledger-reporting",
    url: "https://raw.githubusercontent.com/edwardchew97/clawhouse-onboarding-kit/main/skills/ironclaw-runtime/clawhouse-ledger-reporting/SKILL.md",
  },
];

const tradingSkills = [
  {
    name: "hyperliquid-paper-trading",
    venue: "hyperliquid-paper",
    useWhen: "Hyperliquid paper perps or Hyperliquid paper spot orders through ClawHouse",
    decisionFields: ["market_type", "coin", "side", "leverage", "margin_mode", "size", "tif", "max_slippage_bps", "liquidation_risk"],
    url: "https://raw.githubusercontent.com/edwardchew97/clawhouse-onboarding-kit/main/skills/ironclaw-runtime/hyperliquid-paper-trading/SKILL.md",
  },
];

const requiredInstall = requiredSkills.map((skill) => ({
  tool: "skill_install",
  parameters: skill,
}));

const tradingInstall = tradingSkills.map(({ name, url }) => ({
  tool: "skill_install",
  parameters: { name, url },
}));

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
    tradingSkills,
    futureTradingSkills: "Add one verified manifest entry per venue or trading pattern.",
  },
  install: [...requiredInstall, ...tradingInstall],
  installRequired: requiredInstall,
  installTrading: tradingInstall,
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
