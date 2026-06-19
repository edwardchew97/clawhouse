import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runCli } from "./cli";
import {
  generateNearWallet,
  inspectNearWallet,
  publicInfoFromPublicKey,
} from "./wallet";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("NEAR wallet local dev keystore", () => {
  test("generates a NEAR implicit account and never prints private material", async () => {
    const root = await tempRoot();
    const keyFile = join(root, "nested", "wallet.json");
    const stdout: string[] = [];
    const stderr: string[] = [];

    const exitCode = await runCli(["generate", "--out", keyFile], {
      stdout: (message) => stdout.push(message),
      stderr: (message) => stderr.push(message),
    });

    expect(exitCode).toBe(0);
    expect(stderr.join("")).toBe("");

    const output = JSON.parse(stdout.join(""));
    const rawKeyFile = await readFile(keyFile, "utf8");
    const keyStore = JSON.parse(rawKeyFile);

    expect(output).toEqual({
      walletAddress: expect.stringMatching(/^[0-9a-f]{64}$/),
      publicKey: expect.stringMatching(/^ed25519:[1-9A-HJ-NP-Za-km-z]+$/),
      keyId: expect.stringMatching(/^near-ed25519:[0-9a-f]{64}$/),
      keyFile: resolve(keyFile),
    });
    expect(keyStore.account_id).toBe(output.walletAddress);
    expect(keyStore.public_key).toBe(output.publicKey);
    expect(keyStore.key_id).toBe(output.keyId);
    expect(keyStore.private_key).toMatch(/^ed25519:[1-9A-HJ-NP-Za-km-z]+$/);

    const combinedOutput = `${stdout.join("")}${stderr.join("")}`;
    expect(combinedOutput).not.toContain(keyStore.private_key);
    expect(combinedOutput).not.toContain(
      keyStore.private_key.replace("ed25519:", ""),
    );
  });

  test("inspect returns only deterministic public fields from the key file", async () => {
    const root = await tempRoot();
    const keyFile = join(root, "wallet.json");

    const generated = await generateNearWallet({ keyFile });
    const inspected = await inspectNearWallet({ keyFile });
    const rawKeyFile = await readFile(keyFile, "utf8");
    const keyStore = JSON.parse(rawKeyFile);
    const derived = publicInfoFromPublicKey(keyStore.public_key, resolve(keyFile));

    expect(inspected).toEqual(generated);
    expect(inspected).toEqual(derived);
    expect(JSON.stringify(inspected)).not.toContain(keyStore.private_key);
  });

  test("inspect and read-public commands never print private material", async () => {
    const root = await tempRoot();
    const keyFile = join(root, "wallet.json");
    await generateNearWallet({ keyFile });

    const keyStore = JSON.parse(await readFile(keyFile, "utf8"));

    for (const command of ["inspect", "read-public"]) {
      const stdout: string[] = [];
      const stderr: string[] = [];
      const exitCode = await runCli([command, "--key-file", keyFile], {
        stdout: (message) => stdout.push(message),
        stderr: (message) => stderr.push(message),
      });

      expect(exitCode).toBe(0);
      expect(stderr.join("")).toBe("");
      expect(stdout.join("")).not.toContain(keyStore.private_key);
      expect(stdout.join("")).not.toContain(
        keyStore.private_key.replace("ed25519:", ""),
      );
    }
  });

  test("refuses to overwrite an existing key file unless explicitly allowed", async () => {
    const root = await tempRoot();
    const keyFile = join(root, "wallet.json");

    const first = await generateNearWallet({ keyFile });
    await expect(generateNearWallet({ keyFile })).rejects.toThrow(
      "Key file already exists",
    );

    const second = await generateNearWallet({ keyFile, overwrite: true });
    expect(second.keyFile).toBe(first.keyFile);
    expect(second.publicKey).not.toBe(first.publicKey);
  });

  test("rejects tampered public metadata in a key file", async () => {
    const root = await tempRoot();
    const accountTamperFile = join(root, "account-tamper.json");
    const keyIdTamperFile = join(root, "key-id-tamper.json");

    await generateNearWallet({ keyFile: accountTamperFile });
    const accountTamper = JSON.parse(await readFile(accountTamperFile, "utf8"));
    accountTamper.account_id = "0".repeat(64);
    await writeFile(accountTamperFile, JSON.stringify(accountTamper, null, 2));

    await expect(inspectNearWallet({ keyFile: accountTamperFile })).rejects.toThrow(
      "account_id does not match public_key",
    );

    await generateNearWallet({ keyFile: keyIdTamperFile });
    const keyIdTamper = JSON.parse(await readFile(keyIdTamperFile, "utf8"));
    keyIdTamper.key_id = `near-ed25519:${"1".repeat(64)}`;
    await writeFile(keyIdTamperFile, JSON.stringify(keyIdTamper, null, 2));

    await expect(inspectNearWallet({ keyFile: keyIdTamperFile })).rejects.toThrow(
      "key_id does not match public_key",
    );
  });

  test("rejects invalid local output paths when possible", async () => {
    const root = await tempRoot();
    const directoryPath = join(root, "existing-directory");
    await mkdir(directoryPath);

    await expect(generateNearWallet({ keyFile: "" })).rejects.toThrow(
      "Missing key file path",
    );
    await expect(generateNearWallet({ keyFile: "  " })).rejects.toThrow(
      "Missing key file path",
    );
    await expect(generateNearWallet({ keyFile: "-" })).rejects.toThrow(
      "not stdout",
    );
    await expect(generateNearWallet({ keyFile: "path\0nul" })).rejects.toThrow(
      "NUL bytes",
    );
    await expect(
      generateNearWallet({ keyFile: "file:///tmp/wallet.json" }),
    ).rejects.toThrow("not a URL");
    await expect(generateNearWallet({ keyFile: directoryPath })).rejects.toThrow(
      "points to a directory",
    );
  });
});

async function tempRoot() {
  const path = await mkdtemp(join(tmpdir(), "clawhouse-near-wallet-"));
  tempRoots.push(path);
  return path;
}
