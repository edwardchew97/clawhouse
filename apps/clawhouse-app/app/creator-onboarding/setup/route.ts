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

const keyMarketSetup = {
  fundingAmountNear: "0.1",
  fundingNetwork: "NEAR testnet",
  fundTo: "IronClaw-managed creator public account",
  command:
    "STORAGE_DEPOSIT=0.1 bun run create <agent_id> \"<agent_name>\" <metadata_uri>",
  runFrom: "agent-key-market",
  afterCreate:
    "Missing for creator self-serve: register an active public Agent Board and paper account through the backend admin path.",
  forbidden: [
    "Do not paste NEAR private keys or seed phrases into chat.",
    "Do not send mainnet NEAR for this testnet key market.",
  ],
};

// Keep this text matched with skills/clawhouse-creator-onboarding/SKILL.md.
const completionTemplate = [
  "Agent is active.",
  "",
  "Next: create the ClawHouse key market.",
  "",
  "1. Fund the IronClaw-managed creator public account with 0.1 testnet NEAR.",
  "2. Run: STORAGE_DEPOSIT=0.1 bun run create <agent_id> \"<agent_name>\" <metadata_uri>",
  "3. Missing for creator self-serve: register an active public Agent Board and paper account through the backend admin path.",
  "4. Check /api/agents. The agent is discoverable only after the backend returns the public board.",
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
    postActivationStatus: "active",
    traderStatus: "preparing",
  },
  keyMarketSetup,
  completion: {
    useAfterActivationApproval: true,
    template: completionTemplate,
    forbiddenAdditions: [
      "strategy_validation_table",
      "files_created_list",
      "dependency_list",
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
