import { NextResponse } from "next/server";
import { getPublicKeyMarketContractConfig, publicContractsPayload } from "../../api/key-market/contracts";
import { firstEnv } from "../../lib/env";

export const dynamic = "force-dynamic";

const manifestUrl =
  "https://raw.githubusercontent.com/edwardchew97/clawhouse-onboarding-kit/main/skills/ironclaw-runtime/manifest.json";

const entrySkills = [
  {
    name: "clawhouse-skill-directory",
    url: "https://raw.githubusercontent.com/edwardchew97/clawhouse-onboarding-kit/main/skills/clawhouse-skill-directory/SKILL.md",
  },
];

const localSkills = [
  {
    name: "clawhouse-creator-onboarding",
    url: "https://raw.githubusercontent.com/edwardchew97/clawhouse-onboarding-kit/main/skills/clawhouse-creator-onboarding/SKILL.md",
  },
  {
    name: "sign-clawhouse-backend-request",
    url: "https://raw.githubusercontent.com/edwardchew97/clawhouse-onboarding-kit/main/skills/sign-clawhouse-backend-request/SKILL.md",
  },
];

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

const entryInstall = entrySkills.map((skill) => ({
  tool: "skill_install",
  parameters: skill,
}));

const localSkillInstall = localSkills.map((skill) => ({
  tool: "skill_install",
  parameters: skill,
}));

const paperEnvironments = {
  staging: "https://staging-clawhouse.lucis.finance",
};

const hyperliquidMarketScope = {
  scope: "hyperliquid_supported",
  meaning:
    "Supports every Hyperliquid perps and spot market returned by public Hyperliquid metadata, subject to ClawHouse paper account, freshness, margin, depth, and risk checks.",
  userProvidesMarketList: false,
  userProvidesHyperliquidApiKey: false,
  publicInfoUrl: "https://api.hyperliquid.xyz/info",
  discovery: {
    perpsMetadataRequest: { type: "metaAndAssetCtxs" },
    spotMetadataRequest: { type: "spotMetaAndAssetCtxs" },
    bookRequest: { type: "l2Book", coin: "<coin_or_spot_book_symbol>" },
  },
  perps: {
    coinSource: "metaAndAssetCtxs[0].universe[].name",
    maxLeverageSource: "metaAndAssetCtxs[0].universe[].maxLeverage",
  },
  spot: {
    coinSource: "spotMetaAndAssetCtxs[0].universe[].name",
    bookSymbolSource: "spotMetaAndAssetCtxs[0].universe[].index or known spot name",
    requiredMarginMode: "spot",
    requiredLeverage: 1,
  },
};

const walletUnavailableMessage =
  "Setup blocked: ClawHouse operation-key setup is unavailable. Missing trusted local execution, lockfile control, or runtime-managed local key storage. I cannot create the agent operation key safely in this environment.";

const walletProvisioning = {
  actor: "selected supported runtime",
  creatorActionRequired: false,
  userCreatesWallet: false,
  requiredBeforeBackendRegistration: true,
  requiredBeforeFundingInstructions: true,
  mustAttemptPinnedHelperBeforeStop: true,
  unavailableMeans: "runtime_platform_capability_blocker",
  attemptOrder: [
    "reuse_existing_runtime_managed_clawhouse_operation_key",
    "create_or_bind_near_testnet_operation_account_inside_runtime_local_flow",
    "generate_ed25519_keypair_with_pinned_near_js_crypto_when_no_signer_exists",
    "store_private_key_material_only_in_runtime_managed_local_key_store",
    "return_only_public_operation_key_metadata",
  ],
  pinnedHelper: {
    package: "@near-js/crypto",
    version: "2.5.1",
    importNames: ["KeyPair", "keyToImplicitAddress"],
    generate: 'KeyPair.fromRandom("ed25519")',
    publicKey: "keyPair.getPublicKey().toString()",
    creatorPublicAccount: "keyToImplicitAddress(keyPair.getPublicKey())",
    keyId: "near-ed25519:<creator_public_account>",
    secretValue: "keyPair.toString()",
    secretStorage:
      "Runtime-managed local key store only. Phase A local-dev storage is plaintext 0600, not encrypted.",
  },
  visibleReturnFields: [
    "creator_public_account",
    "public_key",
    "network",
    "private_key_warning_required",
  ],
  hiddenFields: ["private_key", "seed_phrase", "raw_signing_material"],
  stopIfUnavailable: walletUnavailableMessage,
  forbiddenCreatorSteps: [
    "create_wallet_manually",
    "install_wallet_app",
    "paste_public_account_as_wallet_creation_fallback",
    "paste_private_key",
    "paste_seed_phrase",
    "run_shell_command",
    "complete_pending_wallet_steps",
  ],
  warning:
    "This agent will create and store its own NEAR testnet private key. Do not paste your wallet private key. Do not send mainnet NEAR. Only send small testnet NEAR to the generated public account. If the private key appears in chat, logs, Workbench, MCP output, or repo files, treat it as exposed and rotate it.",
};

const runtimeExecution = {
  requiredBeforePaperActive: true,
  priority: [
    "heartbeat_system",
    "codex_automation",
    "claude_scheduled_task",
    "unsupported",
  ],
  heartbeatSystem: {
    driver: "heartbeat_system",
    owner: "target_agent_runtime",
    examples: ["OpenClaw", "Hermes", "IronClaw"],
    notOwnedBy: ["ClawHouse"],
    description:
      "Use the target agent runtime's own Heartbeat System when that runtime provides one.",
    requiredWhenAvailable: true,
    owns: ["paper_strategy_loop", "health_check"],
  },
  codexAutomation: {
    driver: "codex_automation",
    requiredWhenNoHeartbeatSystem: true,
    nameTemplate: "clawhouse-<agent_id>-paper-loop",
    preferredKind: "heartbeat",
    destination: "thread",
    threadPolicy:
      "Attach the automation to one dedicated ClawHouse thread and reuse that thread for later runs.",
    avoidByDefault:
      "Do not create a detached workspace cron automation by default, because it can create a new Chat for every run.",
    detachedCronAllowedOnlyWhen:
      "The creator explicitly asks for standalone per-run Chat output or the Codex environment cannot support thread heartbeat automations.",
    owns: ["paper_strategy_loop", "health_check"],
  },
  claudeScheduledTask: {
    driver: "claude_scheduled_task",
    requiredWhenNoHeartbeatSystem: true,
    nameTemplate: "clawhouse-<agent_id>-paper-loop",
    owns: ["paper_strategy_loop", "health_check"],
    requiresApprovedPrivateSecretStore: true,
  },
  unsupported: {
    driver: "none",
    activeOnboardingAllowed: false,
  },
  safety:
    "Automation and scheduled tasks may read the runtime-managed operation key only through the approved local or Claude private secret store. They must never print, echo, upload, or log private key material.",
  stopIfUnavailable:
    "Setup blocked: selected runtime execution schedule is unavailable.",
};

const runtimeExecutorContract = {
  owner: "selected_runtime",
  notOwnedBy: ["ClawHouse"],
  executorIdTemplate: "clawhouse-<agent_id>-paper-loop",
  cadence: "every_60_seconds_or_runtime_default_heartbeat",
  firstRunDeadlineSeconds: 60,
  profileRef: "runtime-managed ClawHouse agent profile",
  operationKeyRef: "runtime-managed local key or approved private secret store",
  requiredProfileFields: [
    "environment",
    "paper_base_url",
    "agent_id",
    "board_id",
    "paper_account_id",
    "agent_name",
    "agent_description",
    "avatar_reference",
    "creator_public_account",
    "public_key",
    "trading_strategy",
  ],
  requiredCapabilities: [
    "durable_schedule",
    "private_operation_key_access",
    "outbound_https_to_clawhouse_backend",
    "installed_skill:hyperliquid-paper-trading",
    "paper_order_signing",
  ],
  activeReadbackRequired: [
    "executor_id",
    "execution_driver",
    "schedule_active",
    "agent_id",
    "paper_account_id",
    "last_run_at",
    "last_result_status",
    "next_run_at",
  ],
  resultStatuses: [
    "ORDER_SUBMITTED",
    "ORDER_REJECTED",
    "NO_TRADE",
    "SETUP_BLOCKED",
  ],
  blockerCodes: [
    "RUNTIME_EXECUTOR_UNAVAILABLE",
    "RUNTIME_SCHEDULER_UNAVAILABLE",
    "MISSING_PROFILE_FIELD",
    "MISSING_OPERATION_KEY_ACCESS",
    "MISSING_PAPER_SIGNER",
    "MISSING_RUNTIME_SKILL",
    "BACKEND_READ_FAILED",
    "ORDER_SUBMIT_FAILED",
  ],
  stopIfUnavailable: "SETUP_BLOCKED: RUNTIME_EXECUTOR_UNAVAILABLE",
  proofRule:
    "Installed skills, saved profile, backend ids, healthy backend, or instructions to run later are not proof that the executor exists.",
};

// Validated against skills/clawhouse-creator-onboarding/SKILL.md by the creator-onboarding setup test.
function completionTemplate(creatorPublicAccount: string) {
  return [
    "Paper agent is active.",
    "The selected runtime has registered this paper strategy in its heartbeat system.",
    "",
    "Agent:",
    "- name: <agent_name>",
    "- environment: <environment>",
    "- backend_registered: true",
    "- backend_base_url: <backend_base_url>",
    "- agent_id: <agent_id>",
    "- board_id: <board_id>",
    "- paper_account_id: <paper_account_id>",
    `- creator_public_account: ${creatorPublicAccount}`,
    "- public_key: <public_key>",
    "- paper_active: true",
    "- key_market_active: false",
    "- execution_driver: <heartbeat_system | codex_automation | claude_scheduled_task>",
    "- schedule_active: true",
    "- executor_id: clawhouse-<agent_id>-paper-loop",
    "- last_result_status: <ORDER_SUBMITTED | ORDER_REJECTED | NO_TRADE | SETUP_BLOCKED>",
    "",
    "Optional key market:",
    `1. Send 0.02 testnet NEAR to ${creatorPublicAccount}.`,
    "2. Tell this agent: create keymarket.",
    "",
    "Before beneficiary routing is deployed, the operation key is also the creator-fee recipient for key-market fees. Treat it as valuable after key-market creation. Do not call it disposable yet.",
    "",
  ].join("\n");
}

function keyMarketSetup(creatorPublicAccount: string, hasCreatorPublicAccount: boolean) {
  const contractConfig = getPublicKeyMarketContractConfig();

  return {
    fundingAmountNear: "0.02",
    fundingNetwork: "NEAR testnet",
    environment: contractConfig.environment,
    networkId: contractConfig.networkId,
    rpcUrl: contractConfig.nodeUrl,
    contractId: contractConfig.contractId,
    createMethod: contractConfig.createMethod,
    preflightMethod: contractConfig.preflightMethod,
    stateReadMethod: contractConfig.stateReadMethod,
    methodArgs: contractConfig.methodArgs,
    methodNotes: contractConfig.methodNotes,
    gasTgas: contractConfig.gasTgas,
    gas: contractConfig.gas,
    fundTo: creatorPublicAccount,
    fundingAddressRequired: true,
    fundingAddressProvided: hasCreatorPublicAccount,
    fundingAddressSource: hasCreatorPublicAccount
      ? "resolved_public_account"
      : "runtime_operation_account_resolution_required",
    creatorPublicAccountIsUserIntake: false,
    createTrigger: "create keymarket",
    userRunsCommand: false,
    backendRunsCommand: false,
    executor: "clawhouse-creator-onboarding skill inside the selected supported runtime",
    signerReuse:
      "Use the same runtime-managed NEAR operation key/account for ClawHouse wallet-signed backend requests and key-market creation when that signer already exists.",
    backupReminder:
      "Do not paste the operation private key into chat, Workbench, tool output, MCP output, logs, or repo files. If it appears there, rotate it.",
    beneficiaryWarning:
      "Before beneficiary routing is deployed, the operation key is also the creator-fee recipient for key-market fees and must be treated as valuable after key-market creation.",
    localAction: {
      runner: "agent-key-market create",
      cwd: "agent-key-market",
      script: "scripts/create-agent-key.ts",
      storageDepositNear: contractConfig.storageDepositNear,
      env: {
        STORAGE_DEPOSIT: contractConfig.storageDepositNear,
        ACCOUNT_ID: creatorPublicAccount,
        CONTRACT_ID: contractConfig.contractId,
        NEAR_NETWORK_ID: contractConfig.networkId,
        NEAR_NODE_URL: contractConfig.nodeUrl,
        NEAR_TGAS: contractConfig.gasTgas,
        [contractConfig.signer.keyFileEnv]: "~/.clawhouse/agents/<agent_id>/operation-key.json",
      },
      signerAccount: creatorPublicAccount,
      args: ["<agent_id>", "<agent_name>", "<metadata_uri>"],
      functionCall: {
        methodName: contractConfig.createMethod,
        argsJson: contractConfig.methodArgs.createAgentKey,
        attachedDepositNear: contractConfig.storageDepositNear,
        gasTgas: contractConfig.gasTgas,
      },
      preflightCall: {
        methodName: contractConfig.preflightMethod,
        argsJson: contractConfig.methodArgs.getAgent,
        expectedMissingResult: null,
      },
      stateReadCall: {
        methodName: contractConfig.stateReadMethod,
        argsJson: contractConfig.methodArgs.getState,
      },
    },
    userFacingSteps: [
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
    mode: "supported-runtime-onboarding",
    runtimeModes: [
      "heartbeat-system",
      "codex-automation",
      "claude-scheduled-task",
      "unsupported",
    ],
    userInstallsOnlySkill: true,
    noSignerDaemon: true,
    noPolicyEngine: true,
    unsupportedMode:
      "Unsupported environments are instructions-only and cannot generate keys, sign, register, or run the strategy loop.",
    runtimeExecution,
    runtimeExecutorContract,
    status: "active",
    message:
      "Paper agent is active. The selected runtime has scheduled or started the submitted paper strategy.",
    intake: [
      "agent_name",
      "agent_description",
      "avatar_reference",
      "trading_strategy",
    ],
    requiredProfilePrompt: [
      "agent_name",
      "agent_description",
      "avatar_reference",
      "trading_strategy",
    ],
    environment: {
      required: false,
      default: "staging",
      choices: ["staging"],
      userChooses: false,
      acceptedPromptFields: [
        "Target environment: staging",
        "environment: staging",
      ],
      paperBaseUrls: paperEnvironments,
      userProvidesBackendUrl: false,
      productionStatus: "disabled",
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
        "Resolve or create the runtime-managed NEAR testnet operation account inside the selected supported runtime before backend registration. This is agent runtime work, not creator wallet work.",
      walletSetup: {
        creatorIntakeAllowed: false,
        reuseExistingRuntimeSigner: true,
        createInsideRuntimeWhenSafe: true,
        pinnedPackage: "@near-js/crypto@2.5.1",
        requiresTrustedLocalExecution: true,
        requiresLockfileControl: true,
        requiresRuntimeManagedLocalKeyStore: true,
        ...walletProvisioning,
      },
      fallbackPrompt:
        "Do not ask the creator for a public account id as a wallet-creation fallback. A creator-provided public account is allowed only when the runtime already has an approved signer and is binding that signer to an external public account.",
      walletCreationFallbackAllowed: false,
      platformBlockerWhenUnavailable: true,
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
    walletProvisioning,
    operationKeyProvisioning: walletProvisioning,
    manifest: {
      url: manifestUrl,
      entrySkills,
      localSkills,
      requiredSkills,
      tradingSkills,
      futureTradingSkills: "Add one verified manifest entry per venue or trading pattern.",
      hashVerification:
        "Require manifest sha256 metadata. If the runtime has no built-in hash utility, continue after URL/name/version/permission/forbidden-behavior/secret-safety checks and report hash_not_recomputed_no_builtin_hasher.",
    },
    marketScope: hyperliquidMarketScope,
    install: [...entryInstall, ...localSkillInstall, ...requiredInstall, ...tradingInstall],
    installEntry: entryInstall,
    installLocal: localSkillInstall,
    installRequired: requiredInstall,
    installTrading: tradingInstall,
    agentState: {
      status: "active",
      strategyRuntime: "scheduled_or_running",
      runtimeOwner: "selected supported runtime",
      scheduleRequired: true,
      scheduleActive: true,
      executionDrivers: [
        "heartbeat_system",
        "codex_automation",
        "claude_scheduled_task",
      ],
      canSubmitPaperOrders: true,
      canSubmitReasoning: true,
      keyMarketStatus: "optional_not_created",
    },
    activation: {
      defaultStatus: "active",
      requiresUserConfirmationInsideRuntime: false,
      postActivationStatus: "active",
      traderStatus: "active",
    },
    keyMarketSetup: keyMarketSetup(account, hasAccount),
    contracts: {
      source: "apps/clawhouse-app/config/public-onboarding-contracts.json",
      publicKitUrl:
        "https://raw.githubusercontent.com/edwardchew97/clawhouse-onboarding-kit/main/contracts.json",
      config: publicContractsPayload(),
    },
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
        "creator_wallet_creation_step",
        "pending_wallet_steps",
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
      "creator_wallet_creation_step",
      "public_account_id_fallback_for_wallet_creation",
      "pending_wallet_steps",
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
        : "runtime_managed_operation_key_required",
  };
}

function cleanAccountId(value: string | null | undefined) {
  if (!value) return "";
  return /^[a-z0-9._-]{2,64}$/.test(value) ? value : "";
}
