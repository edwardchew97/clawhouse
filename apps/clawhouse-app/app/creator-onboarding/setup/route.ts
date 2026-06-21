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
    decisionFields: [
      "market_type",
      "coin",
      "side",
      "leverage",
      "margin_mode",
      "size",
      "tif",
      "max_slippage_bps",
      "liquidation_risk",
    ],
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

// Keep this text matched with skills/clawhouse-creator-onboarding/SKILL.md.
function completionTemplate(creatorPublicAccount: string) {
  return [
    "Agent is active.",
    "",
    "Next: create the ClawHouse key market so users can trade your key.",
    "",
    "1. Back up the NEAR private key using IronClaw's secure backup or recovery flow.",
    `2. Send 0.02 testnet NEAR to ${creatorPublicAccount}.`,
    "3. Tell this agent: create keymarket.",
    "",
    "The agent can already submit paper orders and reasoning. It will create the key market through the local ClawHouse skill once the account is funded.",
    "",
    "Status: active.",
  ].join("\n");
}

function keyMarketSetup(creatorPublicAccount: string, hasCreatorPublicAccount: boolean) {
  const contractId =
    firstEnv(["CLAWHOUSE_KEY_MARKET_CONTRACT_ID", "KEY_MARKET_CONTRACT_ID", "CONTRACT_ID"]) ??
    "clawhouse-key-20260619125948.testnet";

  return {
    fundingAmountNear: "0.02",
    fundingNetwork: "NEAR testnet",
    contractId,
    fundTo: creatorPublicAccount,
    fundingAddressRequired: true,
    fundingAddressProvided: hasCreatorPublicAccount,
    createTrigger: "create keymarket",
    userRunsCommand: false,
    backendRunsCommand: false,
    executor: "clawhouse-creator-onboarding skill inside the target IronClaw agent",
    signerReuse:
      "Use the same IronClaw-managed NEAR key/account for ClawHouse wallet-signed backend requests and key-market creation when that signer already exists.",
    backupReminder:
      "Back up the NEAR private key using IronClaw's secure backup or recovery flow before funding. Do not paste it into chat, Workbench, tool output, or logs.",
    localAction: {
      runner: "agent-key-market create",
      cwd: "agent-key-market",
      script: "scripts/create-agent-key.ts",
      storageDepositNear: "0.02",
      env: {
        STORAGE_DEPOSIT: "0.02",
        ACCOUNT_ID: creatorPublicAccount,
        CONTRACT_ID: contractId,
        NEAR_NETWORK_ID: "testnet",
      },
      signerAccount: creatorPublicAccount,
      args: ["<agent_id>", "<agent_name>", "<metadata_uri>"],
    },
    userFacingSteps: [
      "Back up the NEAR private key using IronClaw's secure backup or recovery flow.",
      `Send 0.02 testnet NEAR to ${creatorPublicAccount}.`,
      "Tell this agent: create keymarket.",
    ],
    forbidden: [
      "Do not show the creator a bun run command as the normal path.",
      "Do not paste NEAR private keys or seed phrases into chat.",
      "Do not paste NEAR private keys or seed phrases into Workbench, tool output, or logs.",
      "Do not send mainnet NEAR for this testnet key market.",
    ],
  };
}

function payloadFor(request: Request) {
  const { account, hasAccount } = creatorPublicAccount(request);

  return {
    ok: true,
    route: "/creator-onboarding/setup",
    mode: "ironclaw-side-onboarding",
    status: "active",
    message:
      "Agent is active. Use the manifest and skill_install inside IronClaw; the remaining creator actions are secure NEAR private-key backup, key-market funding, and the create keymarket skill action.",
    intake: [
      "agent_name",
      "agent_description",
      "avatar_reference",
      "banner_reference",
      "trading_strategy",
      "creator_public_account",
    ],
    manifest: {
      url: manifestUrl,
      requiredSkills,
      tradingSkills,
      futureTradingSkills: "Add one verified manifest entry per venue or trading pattern.",
    },
    install: [...requiredInstall, ...tradingInstall],
    installRequired: requiredInstall,
    installTrading: tradingInstall,
    agentState: {
      status: "active",
      canSubmitPaperOrders: true,
      canSubmitReasoning: true,
      appDiscoveryBlocker: "missing_key_market",
    },
    activation: {
      defaultStatus: "active",
      requiresUserConfirmationInsideIronClaw: false,
      postActivationStatus: "active",
      traderStatus: "active",
    },
    keyMarketSetup: keyMarketSetup(account, hasAccount),
    completion: {
      useAfterOnboardingCompletion: true,
      useAfterActivationApproval: false,
      template: completionTemplate(account),
      forbiddenAdditions: [
        "strategy_validation_table",
        "files_created_list",
        "dependency_list",
        "confirmation_question",
        "manual_bun_command",
      ],
    },
    forbidden: [
      "api_key_request",
      "private_key_request",
      "seed_phrase_request",
      "custody",
      "withdrawal",
      "real_money_trade_execution",
      "backend_key_market_creation",
    ],
  };
}

export function GET(request: Request) {
  return NextResponse.json(payloadFor(request));
}

function creatorPublicAccount(request: Request) {
  const url = new URL(request.url);
  const account = cleanAccountId(
    url.searchParams.get("creatorPublicAccount") ??
      firstEnv([
        "CLAWHOUSE_CREATOR_PUBLIC_ACCOUNT",
        "CLAWHOUSE_CREATOR_PUBLIC_ACCOUNT_ID",
        "ACCOUNT_ID",
        "NEAR_ACCOUNT_ID",
        "testUserAccountId",
      ]),
  );

  return {
    account: account || "<creator_public_account>",
    hasAccount: Boolean(account),
  };
}

function cleanAccountId(value: string | null | undefined) {
  if (!value) return "";
  return /^[a-z0-9._-]{2,64}$/.test(value) ? value : "";
}

function firstEnv(names: string[]) {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  return undefined;
}
