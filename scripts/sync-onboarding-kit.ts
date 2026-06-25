import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

type JsonRecord = Record<string, unknown>;

type Options = {
  kitRepo: string;
  publish: boolean;
  verify: boolean;
  commitMessage: string;
};

const repoRoot = resolve(import.meta.dir, "..");
const publicKitRemote = "https://github.com/edwardchew97/clawhouse-onboarding-kit.git";
const publicKitRawPrefix =
  "https://raw.githubusercontent.com/edwardchew97/clawhouse-onboarding-kit/main/";

const copiedFiles = [
  "skills/clawhouse-skill-directory/SKILL.md",
  "skills/clawhouse-skill-directory/agents/openai.yaml",
  "skills/clawhouse-creator-onboarding/SKILL.md",
  "skills/clawhouse-creator-onboarding/agents/openai.yaml",
  "skills/sign-clawhouse-backend-request/SKILL.md",
  "skills/ironclaw-runtime/HEARTBEAT.template.md",
  "skills/ironclaw-runtime/RESET.md",
  "skills/ironclaw-runtime/manifest.json",
  "skills/ironclaw-runtime/clawhouse-ledger-reporting/SKILL.md",
  "skills/ironclaw-runtime/hyperliquid-paper-trading/SKILL.md",
];

const rootCopiedFiles = [
  { source: "public/onboarding-kit/skill.md", target: "skill.md" },
  { source: "public/onboarding-kit/skill.json", target: "skill.json" },
  { source: "public/onboarding-kit/INSTALL.md", target: "INSTALL.md" },
  { source: "apps/clawhouse-app/config/public-onboarding-contracts.json", target: "contracts.json" },
];

const retiredPaths = [
  "skills/ironclaw-runtime/near-intents-spot-value",
];

const publicKitPaths = [
  ...copiedFiles,
  ...rootCopiedFiles.map((file) => file.target),
  ...retiredPaths,
];

const requiredRuntimeSkills = [
  "clawhouse-ledger-reporting",
  "hyperliquid-paper-trading",
];

try {
  const options = parseArgs(Bun.argv.slice(2));
  await syncOnboardingKit(options);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

async function syncOnboardingKit(options: Options) {
  await ensureKitRepo(options.kitRepo);
  await checkoutMain(options.kitRepo);
  await assertCleanKitRepo(options.kitRepo);

  const sourceSkillPath = join(repoRoot, "skills/clawhouse-creator-onboarding/SKILL.md");
  const targetSkillPath = join(options.kitRepo, "skills/clawhouse-creator-onboarding/SKILL.md");
  const previousSkill = existsSync(targetSkillPath) ? await readFile(targetSkillPath, "utf8") : "";
  const sourceSkill = await readFile(sourceSkillPath, "utf8");
  const previousVersion = previousSkill ? parseSkillVersion(previousSkill) : "";
  const sourceVersion = parseSkillVersion(sourceSkill);
  const sourceDirectoryPath = join(repoRoot, "skills/clawhouse-skill-directory/SKILL.md");
  const targetDirectoryPath = join(options.kitRepo, "skills/clawhouse-skill-directory/SKILL.md");
  const previousDirectory = existsSync(targetDirectoryPath)
    ? await readFile(targetDirectoryPath, "utf8")
    : "";
  const sourceDirectory = await readFile(sourceDirectoryPath, "utf8");
  const previousDirectoryVersion = previousDirectory ? parseSkillVersion(previousDirectory) : "";
  const sourceDirectoryVersion = parseSkillVersion(sourceDirectory);

  if (previousSkill && previousSkill !== sourceSkill && previousVersion === sourceVersion) {
    throw new Error(
      `Creator onboarding SKILL.md changed but version stayed ${sourceVersion}. Bump the frontmatter version before publishing.`,
    );
  }
  if (
    previousDirectory
    && previousDirectory !== sourceDirectory
    && previousDirectoryVersion === sourceDirectoryVersion
  ) {
    throw new Error(
      `Skill Directory SKILL.md changed but version stayed ${sourceDirectoryVersion}. Bump the frontmatter version before publishing.`,
    );
  }

  await updateManifestHashes();
  await copyAllowlist(options.kitRepo);
  await validateKit(options.kitRepo);

  const status = await git(["status", "--short"], options.kitRepo);
  const ignoredAllowlistStatus = await git(["status", "--short", "--ignored", "--", ...publicKitPaths], options.kitRepo);
  const ignoredAllowlistPaths = statusEntries(ignoredAllowlistStatus.stdout)
    .filter((entry) => entry.status === "!!")
    .map((entry) => entry.path);
  const diff = await git(["diff", "--", ...publicKitPaths], options.kitRepo);
  const changed = status.stdout.trim() !== "" || ignoredAllowlistPaths.length > 0;
  const changedPaths = [...new Set([...statusPaths(status.stdout), ...ignoredAllowlistPaths])];

  printJson({
    ok: true,
    mode: options.publish ? "publish" : "dry-run",
    kitRepo: options.kitRepo,
    copiedFiles,
    creatorOnboarding: {
      previousVersion: previousVersion || null,
      sourceVersion,
      changed: previousSkill !== sourceSkill,
    },
    skillDirectory: {
      previousVersion: previousDirectoryVersion || null,
      sourceVersion: sourceDirectoryVersion,
      changed: previousDirectory !== sourceDirectory,
    },
    changed,
    status: [
      ...status.stdout.trim().split("\n").filter(Boolean),
      ...ignoredAllowlistPaths.map((path) => `!! ${path}`),
    ],
    publicRootFiles: rootCopiedFiles.map((file) => file.target),
  });

  if (diff.stdout.trim()) {
    process.stdout.write("\n--- public kit diff ---\n");
    process.stdout.write(diff.stdout);
  }

  if (!options.publish) {
    await restoreDryRunChanges(options.kitRepo);
    process.stdout.write("\nDry run complete. Re-run with --publish to commit and push public kit main.\n");
    return;
  }

  if (!changed) {
    process.stdout.write("\nNo public kit changes to publish.\n");
    if (options.verify) await verifyRawUrls();
    return;
  }

  await git(["add", "--force", "--", ...changedPaths], options.kitRepo);
  await git(["commit", "-m", options.commitMessage], options.kitRepo);
  await git(["push", "origin", "main"], options.kitRepo);

  const head = await git(["rev-parse", "HEAD"], options.kitRepo);
  process.stdout.write(`\nPublished public kit commit ${head.stdout.trim()}\n`);

  if (options.verify) await verifyRawUrls();
}

async function ensureKitRepo(kitRepo: string) {
  if (existsSync(join(kitRepo, ".git"))) return;
  await mkdir(dirname(kitRepo), { recursive: true });
  await run("git", ["clone", publicKitRemote, kitRepo], repoRoot);
}

async function checkoutMain(kitRepo: string) {
  await git(["fetch", "--prune", "origin"], kitRepo);
  const branch = await git(["branch", "--show-current"], kitRepo);
  if (branch.stdout.trim() !== "main") {
    await git(["checkout", "main"], kitRepo);
  }
  await git(["pull", "--ff-only", "origin", "main"], kitRepo);
}

async function assertCleanKitRepo(kitRepo: string) {
  const status = await git(["status", "--short"], kitRepo);
  if (status.stdout.trim()) {
    throw new Error(`Public kit repo is dirty before sync:\n${status.stdout}`);
  }
}

async function updateManifestHashes() {
  const manifestPath = join(repoRoot, "skills/ironclaw-runtime/manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as JsonRecord;
  const skills = Array.isArray(manifest.skills) ? (manifest.skills as JsonRecord[]) : [];
  let changed = false;

  for (const expectedName of requiredRuntimeSkills) {
    const skill = skills.find((item) => stringField(item, "name") === expectedName);
    if (!skill) throw new Error(`manifest missing ${expectedName}`);
    const localPath = join(repoRoot, "skills/ironclaw-runtime", expectedName, "SKILL.md");
    const raw = await readFile(localPath, "utf8");
    const hash = sha256(raw);
    const version = parseSkillVersion(raw);
    if (skill.version !== version) {
      skill.version = version;
      changed = true;
    }
    if (skill.sha256 !== hash) {
      skill.sha256 = hash;
      changed = true;
    }
  }

  if (changed) {
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  }
}

async function copyAllowlist(kitRepo: string) {
  for (const file of copiedFiles) {
    const source = join(repoRoot, file);
    const target = join(kitRepo, file);
    await assertFile(source);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(source, target);
  }

  for (const file of rootCopiedFiles) {
    const source = join(repoRoot, file.source);
    const target = join(kitRepo, file.target);
    await assertFile(source);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(source, target);
  }

  for (const path of retiredPaths) {
    await rm(join(kitRepo, path), { recursive: true, force: true });
  }
}

async function validateKit(kitRepo: string) {
  const errors: string[] = [];

  for (const file of copiedFiles) {
    const target = join(kitRepo, file);
    const raw = await readFile(target, "utf8");
    errors.push(...secretScan(file, raw));
  }

  for (const file of rootCopiedFiles) {
    const target = join(kitRepo, file.target);
    const raw = await readFile(target, "utf8");
    errors.push(...secretScan(file.target, raw));
  }

  const manifestPath = join(kitRepo, "skills/ironclaw-runtime/manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as JsonRecord;
  if (manifest.schema !== "clawhouse.runtime-pack.v0") {
    errors.push("manifest schema must be clawhouse.runtime-pack.v0");
  }

  const skills = Array.isArray(manifest.skills) ? (manifest.skills as JsonRecord[]) : [];
  for (const expectedName of requiredRuntimeSkills) {
    const skill = skills.find((item) => stringField(item, "name") === expectedName);
    if (!skill) {
      errors.push(`manifest missing ${expectedName}`);
      continue;
    }

    const version = stringField(skill, "version");
    const url = stringField(skill, "url");
    const expectedHash = stringField(skill, "sha256");
    const install = asRecord(skill.install);
    const installParameters = asRecord(install.parameters);
    const localSkillPath = join(kitRepo, "skills/ironclaw-runtime", expectedName, "SKILL.md");
    const actualHash = sha256(await readFile(localSkillPath, "utf8"));

    if (!version) errors.push(`${expectedName} missing version`);
    if (!url.startsWith(publicKitRawPrefix)) errors.push(`${expectedName} url is not public kit raw URL`);
    if (install.tool !== "skill_install") errors.push(`${expectedName} install.tool must be skill_install`);
    if (installParameters.name !== expectedName) errors.push(`${expectedName} install.parameters.name mismatch`);
    if (installParameters.url !== url) errors.push(`${expectedName} install.parameters.url mismatch`);
    if (expectedHash !== actualHash) {
      errors.push(`${expectedName} sha256 mismatch: manifest=${expectedHash} actual=${actualHash}`);
    }
  }

  const allowedPrefixes = asRecord(manifest.install_policy).allowed_url_prefixes;
  if (!Array.isArray(allowedPrefixes) || !allowedPrefixes.includes("https://raw.githubusercontent.com/edwardchew97/clawhouse-onboarding-kit/")) {
    errors.push("manifest install_policy.allowed_url_prefixes missing public kit raw prefix");
  }

  errors.push(...await validateContractsConfig(kitRepo));

  if (errors.length) {
    throw new Error(`Public kit validation failed:\n${errors.map((item) => `- ${item}`).join("\n")}`);
  }
}

async function validateContractsConfig(kitRepo: string) {
  const errors: string[] = [];
  const text = await readFile(join(kitRepo, "contracts.json"), "utf8");
  const config = JSON.parse(text) as JsonRecord;
  if (config.schema_version !== "1.0.0") errors.push("contracts.json schema_version must be 1.0.0");
  if (config.default_environment !== "testnet") errors.push("contracts.json default_environment must be testnet");
  if (config.environment_env !== "CLAWHOUSE_KEY_MARKET_ENVIRONMENT") {
    errors.push("contracts.json environment_env must be CLAWHOUSE_KEY_MARKET_ENVIRONMENT");
  }

  const environments = asRecord(config.environments);
  const testnet = asRecord(environments.testnet);
  const mainnet = asRecord(environments.mainnet);
  const keyMarket = asRecord(testnet.key_market);
  const chainVerification = asRecord(keyMarket.chain_verification);
  const signer = asRecord(keyMarket.signer);
  const methodArgs = asRecord(keyMarket.method_args);
  const createArgs = asRecord(methodArgs.create_agent_key);
  const preflightArgs = asRecord(methodArgs.get_agent);
  const stateArgs = asRecord(methodArgs.get_state);
  const expected = {
    networkId: stringField(testnet, "network_id"),
    rpcUrl: stringField(testnet, "rpc_url"),
    contractId: stringField(keyMarket, "contract_id"),
    createMethod: stringField(keyMarket, "create_method"),
    preflightMethod: stringField(keyMarket, "preflight_method"),
    stateReadMethod: stringField(keyMarket, "state_read_method"),
    storageDepositNear: stringField(keyMarket, "storage_deposit_near"),
    gasTgas: stringField(keyMarket, "gas_tgas"),
  };
  const gasUnits = /^\d+$/.test(expected.gasTgas) ? teraToGasString(expected.gasTgas) : "";

  if (testnet.status !== "enabled") errors.push("contracts.json testnet must be enabled");
  if (expected.networkId !== "testnet") errors.push("contracts.json testnet network_id must be testnet");
  if (!expected.rpcUrl.startsWith("https://")) errors.push("contracts.json testnet rpc_url must be https");
  if (!expected.contractId.endsWith(".testnet")) errors.push("contracts.json testnet contract_id must be a testnet account");
  if (!expected.createMethod) errors.push("contracts.json create_method missing");
  if (!expected.preflightMethod) errors.push("contracts.json preflight_method missing");
  if (!expected.stateReadMethod) errors.push("contracts.json state_read_method missing");
  if (createArgs.agent_id !== "<agent_id>" || createArgs.name !== "<agent_name>" || createArgs.metadata_uri !== "<metadata_uri>") {
    errors.push("contracts.json create_agent_key method_args must include agent_id, name, and metadata_uri placeholders");
  }
  if (preflightArgs.agent_id !== "<agent_id>") {
    errors.push("contracts.json get_agent method_args must include agent_id placeholder");
  }
  if (stateArgs.agent_id !== "<agent_id>" || stateArgs.holder_id !== "<optional_account_id_or_null>") {
    errors.push("contracts.json get_state method_args must include agent_id and holder_id placeholders");
  }
  if (!/^\d+(?:\.\d+)?$/.test(expected.storageDepositNear)) errors.push("contracts.json storage_deposit_near must be numeric");
  if (!/^\d+$/.test(expected.gasTgas)) errors.push("contracts.json gas_tgas must be integer TGas");
  if (Object.prototype.hasOwnProperty.call(keyMarket, "gas_units")) {
    errors.push("contracts.json must not store gas_units; derive it from gas_tgas");
  }
  if (chainVerification.status !== "unverified") {
    errors.push("contracts.json testnet chain_verification.status must be unverified until smoke proof is recorded");
  }
  if (!stringField(chainVerification, "required_proof").includes("create_agent_key")) {
    errors.push("contracts.json testnet chain_verification.required_proof must mention create_agent_key");
  }
  if (signer.source !== "runtime_managed_operation_key") errors.push("contracts.json signer.source mismatch");
  if (!Array.isArray(signer.account_id_env) || !signer.account_id_env.includes("ACCOUNT_ID") || !signer.account_id_env.includes("NEAR_ACCOUNT_ID")) {
    errors.push("contracts.json signer.account_id_env must include ACCOUNT_ID and NEAR_ACCOUNT_ID");
  }
  if (signer.key_file_env !== "CLAWHOUSE_OPERATION_KEY_FILE") {
    errors.push("contracts.json signer.key_file_env mismatch");
  }
  if (mainnet.status !== "disabled") errors.push("contracts.json mainnet must stay disabled");

  const mirrors: Array<[string, string | undefined, string]> = [
    ["CLAWHOUSE_KEY_MARKET_ENVIRONMENT", process.env.CLAWHOUSE_KEY_MARKET_ENVIRONMENT, "testnet"],
    ["CLAWHOUSE_KEY_NEAR_NETWORK_ID", process.env.CLAWHOUSE_KEY_NEAR_NETWORK_ID, expected.networkId],
    ["KEY_NEAR_NETWORK_ID", process.env.KEY_NEAR_NETWORK_ID, expected.networkId],
    ["NEAR_NETWORK_ID", process.env.NEAR_NETWORK_ID, expected.networkId],
    ["CLAWHOUSE_KEY_NEAR_RPC_URL", normalizeRpcMirror(process.env.CLAWHOUSE_KEY_NEAR_RPC_URL, expected.networkId), expected.rpcUrl],
    ["KEY_NEAR_RPC_URL", normalizeRpcMirror(process.env.KEY_NEAR_RPC_URL, expected.networkId), expected.rpcUrl],
    ["NEAR_NODE_URL", normalizeRpcMirror(process.env.NEAR_NODE_URL, expected.networkId), expected.rpcUrl],
    ["CLAWHOUSE_KEY_MARKET_CONTRACT_ID", process.env.CLAWHOUSE_KEY_MARKET_CONTRACT_ID, expected.contractId],
    ["KEY_MARKET_CONTRACT_ID", process.env.KEY_MARKET_CONTRACT_ID, expected.contractId],
    ["CONTRACT_ID", process.env.CONTRACT_ID, expected.contractId],
    ["CLAWHOUSE_KEY_STORAGE_DEPOSIT_NEAR", process.env.CLAWHOUSE_KEY_STORAGE_DEPOSIT_NEAR, expected.storageDepositNear],
    ["STORAGE_DEPOSIT", process.env.STORAGE_DEPOSIT, expected.storageDepositNear],
    ["CLAWHOUSE_KEY_MARKET_GAS", process.env.CLAWHOUSE_KEY_MARKET_GAS, gasUnits],
    ["NEAR_TGAS", process.env.NEAR_TGAS, expected.gasTgas],
  ];
  for (const [name, actual, expectedValue] of mirrors) {
    if (actual && actual !== expectedValue) {
      errors.push(`${name}=${actual} does not match contracts.json expected ${expectedValue}`);
    }
  }

  return errors;
}

async function restoreDryRunChanges(kitRepo: string) {
  const status = await git(["status", "--short"], kitRepo);
  const ignoredStatus = await git(["status", "--short", "--ignored", "--", ...publicKitPaths], kitRepo);
  const entries = statusEntries(status.stdout);
  const ignoredEntries = statusEntries(ignoredStatus.stdout).filter((entry) => entry.status === "!!");
  const trackedPaths = entries.filter((entry) => entry.status !== "??").map((entry) => entry.path);
  const untrackedPaths = entries.filter((entry) => entry.status === "??").map((entry) => entry.path);
  if (trackedPaths.length) {
    await git(["restore", "--staged", "--worktree", "--", ...trackedPaths], kitRepo);
  }
  for (const path of [...untrackedPaths, ...ignoredEntries.map((entry) => entry.path)]) {
    await rm(join(kitRepo, path), { recursive: true, force: true });
  }
  const remainingStatus = await git(["status", "--short", "--ignored", "--", ...publicKitPaths], kitRepo);
  const remaining = statusEntries(remainingStatus.stdout).filter((entry) => entry.status !== "!!" || publicKitPaths.includes(entry.path));
  if (remaining.length) {
    throw new Error(`Dry-run cleanup left public kit dirty:\n${remainingStatus.stdout}`);
  }
}

async function verifyRawUrls() {
  for (const file of copiedFiles) {
    const local = await readFile(join(repoRoot, file), "utf8");
    const url = `${publicKitRawPrefix}${file}`;
    const remote = await readRawUrl(url);
    if (sha256(local) !== sha256(remote)) {
      throw new Error(`Raw verification hash mismatch for ${url}`);
    }
  }

  for (const file of rootCopiedFiles) {
    const local = await readFile(join(repoRoot, file.source), "utf8");
    const url = `${publicKitRawPrefix}${file.target}`;
    const remote = await readRawUrl(url);
    if (sha256(local) !== sha256(remote)) {
      throw new Error(`Raw verification hash mismatch for ${url}`);
    }
  }

  process.stdout.write("\nRaw URL verification passed.\n");
}

async function readRawUrl(url: string) {
  const response = await run(
    "curl",
    ["-L", "--fail", "--silent", "--show-error", "--header", "Cache-Control: no-cache", url],
    repoRoot,
  );
  return response.stdout;
}

function parseArgs(args: string[]): Options {
  const options: Options = {
    kitRepo: join(repoRoot, "work/clawhouse-onboarding-kit"),
    publish: false,
    verify: false,
    commitMessage: "Update creator onboarding kit",
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--kit-repo") {
      options.kitRepo = resolve(readArgValue(args, index, arg));
      index += 1;
      continue;
    }
    if (arg === "--publish") {
      options.publish = true;
      continue;
    }
    if (arg === "--verify") {
      options.verify = true;
      continue;
    }
    if (arg === "--commit-message") {
      options.commitMessage = readArgValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (options.verify && !options.publish) {
    throw new Error("--verify requires --publish because raw URLs only change after push");
  }

  return options;
}

function printUsage() {
  process.stdout.write(`Sync ClawHouse onboarding files into the public onboarding kit repo.

Usage:
  bun scripts/sync-onboarding-kit.ts [--kit-repo <path>] [--publish] [--verify]

Default mode is dry-run: clone/update the kit repo under work/, copy allowlisted
files, validate, and print the public kit diff without committing or pushing.

Options:
  --kit-repo <path>         Existing or new clone path for clawhouse-onboarding-kit
  --publish                 Commit and push changes to public kit main
  --verify                  After publishing, curl raw URLs and compare hashes
  --commit-message <text>   Commit message for public kit publish
`);
}

function readArgValue(args: string[], index: number, name: string) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`Missing value for ${name}`);
  return value;
}

async function assertFile(path: string) {
  const info = await stat(path).catch(() => null);
  if (!info?.isFile()) {
    throw new Error(`Missing source file: ${relative(repoRoot, path)}`);
  }
}

function parseSkillVersion(raw: string) {
  const match = raw.match(/^version:\s*([^\s]+)\s*$/m);
  if (!match) throw new Error("SKILL.md is missing frontmatter version");
  return match[1];
}

function teraToGasString(value: string) {
  if (!/^\d+$/.test(value)) throw new Error(`Invalid TGas value: ${value}`);
  return (BigInt(value) * BigInt(1_000_000_000_000)).toString();
}

function normalizeRpcMirror(value: string | undefined, networkId: string) {
  if (value === `https://rpc.${networkId}.near.org`) {
    return `https://rpc.${networkId}.fastnear.com`;
  }
  return value;
}

function secretScan(file: string, raw: string) {
  const errors: string[] = [];
  const checks = [
    /ed25519:[A-Za-z0-9+/=]{80,}/g,
    /-----BEGIN (?:PRIVATE|OPENSSH PRIVATE) KEY-----/g,
    /\b(?:sk|rk|pk)_[A-Za-z0-9]{32,}\b/g,
  ];

  for (const pattern of checks) {
    if (pattern.test(raw)) errors.push(`${file} appears to contain private key material`);
  }

  return errors;
}

function statusPaths(raw: string) {
  return statusEntries(raw).map((entry) => entry.path);
}

function statusEntries(raw: string) {
  return raw
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => ({
      status: line.slice(0, 2),
      path: line.slice(3).replace(/^.* -> /, ""),
    }))
    .filter((entry) => isPublicKitPath(entry.path));
}

function isPublicKitPath(path: string) {
  const normalizedPath = path.replace(/\/+$/, "");
  return publicKitPaths.some((allowed) =>
    normalizedPath === allowed
    || normalizedPath.startsWith(`${allowed}/`)
    || allowed.startsWith(`${normalizedPath}/`)
  );
}

function stringField(record: JsonRecord, key: string) {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function git(args: string[], cwd: string) {
  return await run("git", args, cwd);
}

async function run(command: string, args: string[], cwd: string) {
  const proc = Bun.spawn([command, ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed in ${cwd}\n${stderr || stdout}`);
  }

  return { stdout, stderr };
}

function printJson(value: unknown) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}
