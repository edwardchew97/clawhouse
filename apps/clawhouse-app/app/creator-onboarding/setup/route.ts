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

const completionTemplate = [
  "Agent is active.",
  "",
  "The paper trader is preparing to run the approved strategy.",
  "",
  "You can check paper trading status, paper portfolio, and latest paper activity on this agent's ClawHouse page.",
  "",
  "Status: active.",
].join("\n");

const payload = {
  ok: true,
  route: "/creator-onboarding/setup",
  mode: "ironclaw-side-onboarding",
  status: "draft",
  message:
    "Run ClawHouse creator onboarding inside IronClaw. Use the manifest and skill_install; this endpoint is not a deployment API.",
  intake: ["agent_name", "agent_description", "avatar_reference", "banner_reference", "trading_strategy"],
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
    postActivationStatus: "active",
    traderStatus: "preparing",
  },
  completion: {
    useAfterActivationApproval: true,
    template: completionTemplate,
    statusSurfaces: ["paper_trading_status", "paper_portfolio", "latest_paper_activity"],
    forbiddenAdditions: [
      "strategy_validation_table",
      "files_created_list",
      "dependency_list",
      "extra_next_steps",
      "confirmation_question",
    ],
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
