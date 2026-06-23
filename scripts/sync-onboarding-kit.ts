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
  "skills/clawhouse-creator-onboarding/SKILL.md",
  "skills/clawhouse-creator-onboarding/agents/openai.yaml",
  "skills/sign-clawhouse-backend-request/SKILL.md",
  "skills/ironclaw-runtime/HEARTBEAT.template.md",
  "skills/ironclaw-runtime/RESET.md",
  "skills/ironclaw-runtime/manifest.json",
  "skills/ironclaw-runtime/clawhouse-ledger-reporting/SKILL.md",
  "skills/ironclaw-runtime/hyperliquid-paper-trading/SKILL.md",
];

const retiredPaths = [
  "skills/ironclaw-runtime/near-intents-spot-value",
];

const publicKitPaths = [...copiedFiles, ...retiredPaths];

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

  if (previousSkill && previousSkill !== sourceSkill && previousVersion === sourceVersion) {
    throw new Error(
      `Creator onboarding SKILL.md changed but version stayed ${sourceVersion}. Bump the frontmatter version before publishing.`,
    );
  }

  await updateManifestHashes();
  await copyAllowlist(options.kitRepo);
  await validateKit(options.kitRepo);

  const status = await git(["status", "--short"], options.kitRepo);
  const diff = await git(["diff", "--", ...publicKitPaths], options.kitRepo);
  const changed = status.stdout.trim() !== "";
  const changedPaths = statusPaths(status.stdout);

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
    changed,
    status: status.stdout.trim().split("\n").filter(Boolean),
    publicRootFiles: {
      note: "Root skill.json, skill.md, and INSTALL.md are preserved unless source templates are added to the main repo.",
    },
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

  await git(["add", "--", ...changedPaths], options.kitRepo);
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

  if (errors.length) {
    throw new Error(`Public kit validation failed:\n${errors.map((item) => `- ${item}`).join("\n")}`);
  }
}

async function restoreDryRunChanges(kitRepo: string) {
  const status = await git(["status", "--short"], kitRepo);
  const entries = statusEntries(status.stdout);
  const trackedPaths = entries.filter((entry) => entry.status !== "??").map((entry) => entry.path);
  const untrackedPaths = entries.filter((entry) => entry.status === "??").map((entry) => entry.path);
  if (trackedPaths.length) {
    await git(["restore", "--staged", "--worktree", "--", ...trackedPaths], kitRepo);
  }
  for (const path of untrackedPaths) {
    await rm(join(kitRepo, path), { recursive: true, force: true });
  }
  const remainingStatus = await git(["status", "--short"], kitRepo);
  if (remainingStatus.stdout.trim()) {
    throw new Error(`Dry-run cleanup left public kit dirty:\n${remainingStatus.stdout}`);
  }
}

async function verifyRawUrls() {
  for (const file of copiedFiles) {
    const local = await readFile(join(repoRoot, file), "utf8");
    const url = `${publicKitRawPrefix}${file}`;
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Raw verification failed for ${url}: HTTP ${response.status}`);
    }
    const remote = await response.text();
    if (sha256(local) !== sha256(remote)) {
      throw new Error(`Raw verification hash mismatch for ${url}`);
    }
  }

  process.stdout.write("\nRaw URL verification passed.\n");
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
  if (!match) throw new Error("Creator onboarding SKILL.md is missing frontmatter version");
  return match[1];
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
