import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

type JsonRecord = Record<string, unknown>;

const repoRoot = resolve(import.meta.dir, "..");
const runtimeRoot = join(repoRoot, "skills/ironclaw-runtime");
const manifestPath = join(runtimeRoot, "manifest.json");

try {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as JsonRecord;
  const skills = Array.isArray(manifest.skills) ? manifest.skills as JsonRecord[] : [];
  const checkedSkills = [];
  const errors: string[] = [];

  for (const skill of skills) {
    const name = stringField(skill, "name");
    const expectedHash = stringField(skill, "sha256");
    const url = stringField(skill, "url");
    const localPath = name ? join(runtimeRoot, name, "SKILL.md") : "";
    const raw = localPath ? await readFile(localPath, "utf8").catch(() => "") : "";
    const actualHash = raw ? sha256(raw) : "";
    const hashMatches = Boolean(expectedHash && actualHash && expectedHash === actualHash);

    if (!name) errors.push("skill missing name");
    if (!expectedHash) errors.push(`${name || "unknown"} missing sha256`);
    if (!raw) errors.push(`${name || "unknown"} missing local SKILL.md`);
    if (expectedHash && actualHash && !hashMatches) errors.push(`${name} sha256 mismatch`);
    if (url && !url.startsWith("https://raw.githubusercontent.com/edwardchew97/clawhouse-onboarding-kit/")) {
      errors.push(`${name} url is not allowlisted`);
    }

    checkedSkills.push({
      name,
      version: stringField(skill, "version"),
      required: skill.required === true,
      url,
      localPath: localPath ? relative(repoRoot, localPath) : "",
      expectedSha256: expectedHash,
      actualSha256: actualHash,
      hashMatches,
      forbiddenBehaviors: Array.isArray(skill.forbidden_behaviors) ? skill.forbidden_behaviors : [],
      permissions: skill.permissions ?? null,
    });
  }

  const heartbeat = await fileExists(join(runtimeRoot, "HEARTBEAT.template.md"));
  const reset = await fileExists(join(runtimeRoot, "RESET.md"));
  if (!heartbeat) errors.push("missing HEARTBEAT.template.md");
  if (!reset) errors.push("missing RESET.md");

  printJson({
    ok: errors.length === 0,
    manifestPath: relative(repoRoot, manifestPath),
    schema: manifest.schema,
    pack: manifest.pack ?? null,
    installPolicy: manifest.install_policy ?? null,
    checkedSkills,
    files: {
      heartbeatTemplate: heartbeat,
      resetGuide: reset,
    },
    errors,
  });
} catch (error) {
  printJson({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
}

function stringField(value: JsonRecord, key: string) {
  const item = value[key];
  return typeof item === "string" ? item : "";
}

async function fileExists(path: string) {
  return await stat(path).then(() => true, () => false);
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function printJson(value: unknown) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}
