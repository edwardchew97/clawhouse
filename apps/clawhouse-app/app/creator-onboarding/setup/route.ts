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

const paperEnvironments = {
  staging: "https://clawhouse-backend-staging.vercel.app",
  production: "https://clawhouse-backend-prod.vercel.app",
};

// Keep this text matched with skills/clawhouse-creator-onboarding/SKILL.md.
function completionTemplate(creatorPublicAccount: string) {
  return [
    "Agent is active.",
    "IronClaw is running this strategy.",
    "",
    "Agent:",
    "- name: <agent_name>",
    "- environment: <environment>",
    `- creator_public_account: ${creatorPublicAccount}`,
    "- public_key: <public_key>",
    "- key_id: <key_id>",
    "",
    "Optional key market:",
    "To let users buy or sell this agent key later:",
    "1. Back up the NEAR private key using IronClaw's secure backup or recovery flow.",
    `2. Send 0.02 testnet NEAR to ${creatorPublicAccount}.`,
    "3. Tell this agent: create keymarket.",
    "",
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
    fundingAddressSource: hasCreatorPublicAccount
      ? "resolved_public_account"
      : "ironclaw_account_resolution_required",
    creatorPublicAccountIsUserIntake: false,
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
  const { account, hasAccount, source } = creatorPublicAccount(request);

  return {
    ok: true,
    route: "/creator-onboarding/setup",
    mode: "ironclaw-side-onboarding",
    status: "active",
    message:
      "Agent is active and IronClaw is running the submitted strategy. Key-market funding is optional and only needed later if the creator wants users to buy or sell the agent key.",
    intake: [
      "environment",
      "agent_name",
      "agent_description",
      "avatar_reference",
      "trading_strategy",
    ],
    optionalIntake: ["banner_reference"],
    requiredProfilePrompt: [
      "agent_name",
      "agent_description",
      "avatar_reference",
      "trading_strategy",
    ],
    defaultBannerReference: "ClawHouse default display banner",
    environment: {
      required: true,
      choices: ["staging", "production"],
      acceptedPromptFields: [
        "Target environment: staging",
        "environment: staging",
        "Target environment: production",
        "environment: production",
      ],
      paperBaseUrls: paperEnvironments,
      userProvidesBackendUrl: false,
    },
    profileIntakeGate: {
      requiredBeforeTools: true,
      requiredSource: "current_chat_or_direct_intake_reply",
      doNotFillFrom: ["memory_search", "previous_profile", "chat_history", "IDENTITY.md"],
      clearedMarkerMeansMissing: "CLEARED_BY_CLAWHOUSE_TEST",
      missingFieldsResponseOnly: true,
      missingFieldsPromptTail: ["Do not include secrets."],
      doNotMentionBeforeProfileComplete: [
        "runtime_skills",
        "paper_orders",
        "later_setup_steps",
      ],
      stopBefore: [
        "runtime_skill_install",
        "heartbeat_configuration",
        "clawhouse_backend_read",
        "paper_order_attempt",
      ],
    },
    resolvedFields: ["creator_public_account"],
    creatorPublicAccount: {
      userIntake: false,
      account,
      source,
      resolution:
        "Resolve or create the IronClaw-managed NEAR testnet public account inside IronClaw. Never ask the creator for internal wallet setup details, private keys, seed phrases, or raw signing material.",
      walletSetup: {
        creatorIntakeAllowed: false,
        reuseExistingIronClawSigner: true,
        createInsideIronClawWhenSafe: true,
        pinnedPackage: "@near-js/crypto@2.5.1",
        requiresTrustedLocalExecution: true,
        requiresLockfileControl: true,
        requiresSecureSecretStore: true,
        stopIfUnavailable:
          "IronClaw secure local wallet setup is unavailable. I cannot create the agent wallet safely in this environment.",
        visibleReturnFields: [
          "creator_public_account",
          "public_key",
          "key_id",
          "network",
          "private_key_backup_required",
        ],
        hiddenFields: ["private_key", "seed_phrase", "raw_signing_material"],
      },
      fallbackPrompt:
        "Ask for a public account id only when IronClaw already has an approved signer but needs an external public account binding. Do not use this as normal profile intake.",
      doNotResolveFrom: [
        "memory_search",
        "memory_tree",
        "memory_read",
        "IDENTITY.md",
        "previous_clawhouse_profile",
        "secret_list",
        "secret_names",
        "tool_search",
        "tool_list",
      ],
      privateKeyHandling:
        "Never ask for, store, echo, or log the NEAR private key, seed phrase, or raw signing material.",
    },
    manifest: {
      url: manifestUrl,
      requiredSkills,
      tradingSkills,
      futureTradingSkills: "Add one verified manifest entry per venue or trading pattern.",
      hashVerification:
        "Require manifest sha256 metadata. Do not use __codeact__, Python, shell, package imports, or hashlib only to compute hashes inside IronClaw. If no built-in hash utility exists, continue after URL/name/version/permission/forbidden-behavior/secret-safety checks and report hash_not_recomputed_no_builtin_hasher.",
    },
    install: [...requiredInstall, ...tradingInstall],
    installRequired: requiredInstall,
    installTrading: tradingInstall,
    agentState: {
      status: "active",
      strategyRuntime: "running",
      runtimeOwner: "IronClaw",
      canSubmitPaperOrders: true,
      canSubmitReasoning: true,
      keyMarketStatus: "optional_not_created",
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
      "portfolio_for_paper_trade",
      "dune_sim_for_paper_trade",
      "near_intents_for_paper_trade",
      "api_clawhouse_com_for_paper_trade",
      "paper_trade_route_outside_paper_namespace",
      "skill_list_for_onboarding_discovery",
      "tool_list_for_onboarding_discovery",
      "skill_search_clawhouse",
      "tool_search_clawhouse",
      "tool_info_clawhouse_creator_onboarding",
      "tool_install_clawhouse_creator_onboarding",
      "skill_install_clawhouse_creator_onboarding_during_fixed_flow",
      "skill_install_clawhouse_creator_onboarding_without_url",
      "skill_install_runtime_skill_without_url",
      "http_without_literal_url",
      "github_contents_api_for_manifest_discovery",
      "tool_info_runtime_skill_schema",
      "tool_search_near_wallet_helper",
      "paper_order_probe_without_required_config",
      "web_search_for_clawhouse_endpoints",
      "staging_api_clawhouse_com_for_paper_trade",
      "skill_install_with_fetched_skill_markdown_as_name",
    ],
  };
}

export function GET(request: Request) {
  return NextResponse.json(payloadFor(request));
}

function creatorPublicAccount(request: Request) {
  const url = new URL(request.url);
  const queryAccount = cleanAccountId(url.searchParams.get("creatorPublicAccount"));
  const envAccount = cleanAccountId(
    firstEnv([
      "CLAWHOUSE_CREATOR_PUBLIC_ACCOUNT",
      "CLAWHOUSE_CREATOR_PUBLIC_ACCOUNT_ID",
      "ACCOUNT_ID",
      "NEAR_ACCOUNT_ID",
      "testUserAccountId",
    ]),
  );
  const account = queryAccount || envAccount;

  return {
    account: account || "<creator_public_account>",
    hasAccount: Boolean(account),
    source: queryAccount
      ? "request_query"
      : envAccount
        ? "environment"
        : "ironclaw_managed_wallet_required",
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
