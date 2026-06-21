import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runCli } from "./cli";
import {
  buildAgentBoardLedgerRequestPayload,
  generateNearWallet,
  hashRequestBody,
  inspectNearWallet,
  inspectNearWalletPrivateInfo,
  publicInfoFromPublicKey,
  signAgentBoardLedgerRequest,
  serializeAgentBoardLedgerRequestPayload,
  verifyAgentBoardLedgerRequestSignature,
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

  test("private inspection is explicit and still validates the key pair", async () => {
    const root = await tempRoot();
    const keyFile = join(root, "wallet.json");

    const generated = await generateNearWallet({ keyFile });
    const rawKeyFile = await readFile(keyFile, "utf8");
    const keyStore = JSON.parse(rawKeyFile);
    const privateInfo = await inspectNearWalletPrivateInfo({ keyFile });

    expect(privateInfo).toEqual({
      ...generated,
      privateKey: keyStore.private_key,
    });
    expect(privateInfo.privateKey).toMatch(/^ed25519:[1-9A-HJ-NP-Za-km-z]+$/);
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

describe("Agent Board Ledger request signatures", () => {
  test("signs a canonical request payload that can be verified", async () => {
    const root = await tempRoot();
    const keyFile = join(root, "wallet.json");
    const body = JSON.stringify({ tx_hash: "tx-1", reason: "rebalance" });
    await generateNearWallet({ keyFile });

    const signed = await signAgentBoardLedgerRequest({
      keyFile,
      method: "post",
      path: "/boards/board-1/events",
      body,
      timestamp: "2026-06-19T00:00:00.000Z",
      nonce: "nonce-1",
      boardId: "board-1",
      agentId: "agent-1",
    });

    expect(signed.method).toBe("POST");
    expect(signed.bodyHash).toBe(hashRequestBody(body));
    expect(signed.signature).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(signed.headers).toMatchObject({
      "x-clawhouse-wallet-address": signed.walletAddress,
      "x-clawhouse-public-key": signed.publicKey,
      "x-clawhouse-timestamp": "2026-06-19T00:00:00.000Z",
      "x-clawhouse-nonce": "nonce-1",
      "x-clawhouse-body-sha256": hashRequestBody(body),
      "x-clawhouse-signature": signed.signature,
    });
    expect(Object.keys(signed.headers).sort()).toEqual(
      [
        "x-clawhouse-body-sha256",
        "x-clawhouse-nonce",
        "x-clawhouse-public-key",
        "x-clawhouse-signature",
        "x-clawhouse-timestamp",
        "x-clawhouse-wallet-address",
      ].sort(),
    );

    expect(
      verifyAgentBoardLedgerRequestSignature({
        publicKey: signed.publicKey,
        walletAddress: signed.walletAddress,
        signature: signed.signature,
        method: "POST",
        path: "/boards/board-1/events",
        body,
        timestamp: "2026-06-19T00:00:00.000Z",
        nonce: "nonce-1",
        boardId: "board-1",
        agentId: "agent-1",
      }),
    ).toBe(true);
  });

  test("rejects a signature when the request body is tampered with", async () => {
    const root = await tempRoot();
    const keyFile = join(root, "wallet.json");
    await generateNearWallet({ keyFile });

    const signed = await signAgentBoardLedgerRequest({
      keyFile,
      method: "POST",
      path: "/boards/board-1/events",
      body: JSON.stringify({ side: "buy", amount: "100" }),
      timestamp: "2026-06-19T00:00:00.000Z",
      nonce: "nonce-1",
      boardId: "board-1",
      agentId: "agent-1",
    });

    expect(
      verifyAgentBoardLedgerRequestSignature({
        publicKey: signed.publicKey,
        walletAddress: signed.walletAddress,
        signature: signed.signature,
        method: "POST",
        path: "/boards/board-1/events",
        body: JSON.stringify({ side: "buy", amount: "101" }),
        timestamp: "2026-06-19T00:00:00.000Z",
        nonce: "nonce-1",
        boardId: "board-1",
        agentId: "agent-1",
      }),
    ).toBe(false);
  });

  test("refuses to sign if private and public key material do not match", async () => {
    const root = await tempRoot();
    const keyFile = join(root, "wallet.json");
    const otherKeyFile = join(root, "other-wallet.json");
    await generateNearWallet({ keyFile });
    await generateNearWallet({ keyFile: otherKeyFile });

    const keyStore = JSON.parse(await readFile(keyFile, "utf8"));
    const otherKeyStore = JSON.parse(await readFile(otherKeyFile, "utf8"));
    keyStore.private_key = otherKeyStore.private_key;
    await writeFile(keyFile, JSON.stringify(keyStore, null, 2));

    await expect(
      signAgentBoardLedgerRequest({
        keyFile,
        method: "POST",
        path: "/boards/board-1/events",
        body: "{}",
        timestamp: "2026-06-19T00:00:00.000Z",
        nonce: "nonce-1",
        boardId: "board-1",
        agentId: "agent-1",
      }),
    ).rejects.toThrow("private_key does not match public_key");
  });

  test("includes timestamp and nonce in the canonical payload", async () => {
    const root = await tempRoot();
    const keyFile = join(root, "wallet.json");
    await generateNearWallet({ keyFile });

    const first = await signAgentBoardLedgerRequest({
      keyFile,
      method: "POST",
      path: "/boards/board-1/events",
      body: "{}",
      timestamp: "2026-06-19T00:00:00.000Z",
      nonce: "nonce-1",
      boardId: "board-1",
      agentId: "agent-1",
    });
    const second = await signAgentBoardLedgerRequest({
      keyFile,
      method: "POST",
      path: "/boards/board-1/events",
      body: "{}",
      timestamp: "2026-06-19T00:00:01.000Z",
      nonce: "nonce-2",
      boardId: "board-1",
      agentId: "agent-1",
    });
    const payload = buildAgentBoardLedgerRequestPayload({
      method: "POST",
      path: "/boards/board-1/events",
      body: "{}",
      timestamp: "2026-06-19T00:00:00.000Z",
      nonce: "nonce-1",
      boardId: "board-1",
      agentId: "agent-1",
      walletAddress: first.walletAddress,
    });

    expect(first.signature).not.toBe(second.signature);
    expect(serializeAgentBoardLedgerRequestPayload(payload)).toBe(
      JSON.stringify({
        domain: "clawhouse.agent-board-ledger.v0",
        version: 1,
        method: "POST",
        path: "/boards/board-1/events",
        bodyHash: hashRequestBody("{}"),
        timestamp: "2026-06-19T00:00:00.000Z",
        nonce: "nonce-1",
        boardId: "board-1",
        agentId: "agent-1",
        walletAddress: first.walletAddress,
      }),
    );
  });

  test("sign-request and verify-request commands never print private material", async () => {
    const root = await tempRoot();
    const keyFile = join(root, "wallet.json");
    const body = JSON.stringify({ tx_hash: "tx-1" });
    await generateNearWallet({ keyFile });

    const keyStore = JSON.parse(await readFile(keyFile, "utf8"));
    const signStdout: string[] = [];
    const signStderr: string[] = [];
    const signExitCode = await runCli(
      [
        "sign-request",
        "--key-file",
        keyFile,
        "--method",
        "POST",
        "--path",
        "/boards/board-1/events",
        "--body",
        body,
        "--board-id",
        "board-1",
        "--agent-id",
        "agent-1",
        "--timestamp",
        "2026-06-19T00:00:00.000Z",
        "--nonce",
        "nonce-1",
      ],
      {
        stdout: (message) => signStdout.push(message),
        stderr: (message) => signStderr.push(message),
      },
    );

    expect(signExitCode).toBe(0);
    expect(signStderr.join("")).toBe("");

    const signed = JSON.parse(signStdout.join(""));
    expect(signed.headers["x-clawhouse-signature"]).toBe(signed.signature);

    const verifyStdout: string[] = [];
    const verifyStderr: string[] = [];
    const verifyExitCode = await runCli(
      [
        "verify-request",
        "--public-key",
        signed.publicKey,
        "--wallet-address",
        signed.walletAddress,
        "--signature",
        signed.signature,
        "--method",
        "POST",
        "--path",
        "/boards/board-1/events",
        "--body",
        body,
        "--board-id",
        "board-1",
        "--agent-id",
        "agent-1",
        "--timestamp",
        "2026-06-19T00:00:00.000Z",
        "--nonce",
        "nonce-1",
      ],
      {
        stdout: (message) => verifyStdout.push(message),
        stderr: (message) => verifyStderr.push(message),
      },
    );

    expect(verifyExitCode).toBe(0);
    expect(verifyStderr.join("")).toBe("");
    expect(JSON.parse(verifyStdout.join("")).ok).toBe(true);

    const combinedOutput = [
      signStdout.join(""),
      signStderr.join(""),
      verifyStdout.join(""),
      verifyStderr.join(""),
    ].join("");
    expect(combinedOutput).not.toContain(keyStore.private_key);
    expect(combinedOutput).not.toContain(
      keyStore.private_key.replace("ed25519:", ""),
    );
  });

  test("verify-request reports ok false for a tampered body", async () => {
    const root = await tempRoot();
    const keyFile = join(root, "wallet.json");
    await generateNearWallet({ keyFile });

    const signed = await signAgentBoardLedgerRequest({
      keyFile,
      method: "POST",
      path: "/boards/board-1/events",
      body: JSON.stringify({ side: "buy", amount: "100" }),
      timestamp: "2026-06-19T00:00:00.000Z",
      nonce: "nonce-1",
      boardId: "board-1",
      agentId: "agent-1",
    });
    const stdout: string[] = [];
    const stderr: string[] = [];
    const exitCode = await runCli(
      [
        "verify-request",
        "--public-key",
        signed.publicKey,
        "--wallet-address",
        signed.walletAddress,
        "--signature",
        signed.signature,
        "--method",
        "POST",
        "--path",
        "/boards/board-1/events",
        "--body",
        JSON.stringify({ side: "buy", amount: "101" }),
        "--board-id",
        "board-1",
        "--agent-id",
        "agent-1",
        "--timestamp",
        "2026-06-19T00:00:00.000Z",
        "--nonce",
        "nonce-1",
      ],
      {
        stdout: (message) => stdout.push(message),
        stderr: (message) => stderr.push(message),
      },
    );

    expect(exitCode).toBe(0);
    expect(stderr.join("")).toBe("");
    expect(JSON.parse(stdout.join("")).ok).toBe(false);
  });

  test("sign-request accepts a body file", async () => {
    const root = await tempRoot();
    const keyFile = join(root, "wallet.json");
    const bodyFile = join(root, "body.json");
    const body = JSON.stringify({ tx_hash: "tx-from-file" });
    await generateNearWallet({ keyFile });
    await writeFile(bodyFile, body);

    const stdout: string[] = [];
    const stderr: string[] = [];
    const exitCode = await runCli(
      [
        "sign-request",
        "--key-file",
        keyFile,
        "--method",
        "POST",
        "--path",
        "/boards/board-1/events",
        "--body-file",
        bodyFile,
        "--board-id",
        "board-1",
        "--agent-id",
        "agent-1",
        "--timestamp",
        "2026-06-19T00:00:00.000Z",
        "--nonce",
        "nonce-1",
      ],
      {
        stdout: (message) => stdout.push(message),
        stderr: (message) => stderr.push(message),
      },
    );

    expect(exitCode).toBe(0);
    expect(stderr.join("")).toBe("");

    const signed = JSON.parse(stdout.join(""));
    expect(signed.bodyHash).toBe(hashRequestBody(body));
    expect(
      verifyAgentBoardLedgerRequestSignature({
        publicKey: signed.publicKey,
        walletAddress: signed.walletAddress,
        signature: signed.signature,
        method: "POST",
        path: "/boards/board-1/events",
        body,
        timestamp: "2026-06-19T00:00:00.000Z",
        nonce: "nonce-1",
        boardId: "board-1",
        agentId: "agent-1",
      }),
    ).toBe(true);
  });

  test("sign-request rejects a mismatched explicit body hash", async () => {
    const root = await tempRoot();
    const keyFile = join(root, "wallet.json");
    await generateNearWallet({ keyFile });

    const stdout: string[] = [];
    const stderr: string[] = [];
    const exitCode = await runCli(
      [
        "sign-request",
        "--key-file",
        keyFile,
        "--method",
        "POST",
        "--path",
        "/boards/board-1/events",
        "--body",
        "{}",
        "--body-sha256",
        "0".repeat(64),
        "--board-id",
        "board-1",
        "--agent-id",
        "agent-1",
      ],
      {
        stdout: (message) => stdout.push(message),
        stderr: (message) => stderr.push(message),
      },
    );

    expect(exitCode).toBe(1);
    expect(stdout.join("")).toBe("");
    expect(stderr.join("")).toContain(
      "Provided --body-sha256 does not match request body",
    );
  });
});

async function tempRoot() {
  const path = await mkdtemp(join(tmpdir(), "clawhouse-near-wallet-"));
  tempRoots.push(path);
  return path;
}
