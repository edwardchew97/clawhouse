import { readFile } from "node:fs/promises";
import {
  buildAgentBoardLedgerRequestPayload,
  generateNearWallet,
  hashRequestBody,
  inspectNearWallet,
  signAgentBoardLedgerRequest,
  verifyAgentBoardLedgerRequestSignature,
} from "./wallet";

type CliIo = {
  stdout: (message: string) => void;
  stderr: (message: string) => void;
};

type ParsedOptions = {
  out?: string;
  keyFile?: string;
  method?: string;
  path?: string;
  body?: string;
  bodyFile?: string;
  bodyHash?: string;
  timestamp?: string;
  nonce?: string;
  boardId?: string;
  agentId?: string;
  publicKey?: string;
  walletAddress?: string;
  signature?: string;
  overwrite: boolean;
  help: boolean;
};

const HELP = `ClawHouse NEAR wallet local dev tool

Usage:
  bun run generate -- --out <local-key-file> [--overwrite]
  bun run inspect -- --key-file <local-key-file>
  bun run read-public -- --key-file <local-key-file>
  bun run sign-request -- --key-file <local-key-file> --method POST --path <path> --body <json> --board-id <id> --agent-id <id> [--timestamp <value>] [--nonce <value>]
  bun run verify-request -- --public-key <key> --wallet-address <address> --signature <signature> --method POST --path <path> --body <json> --board-id <id> --agent-id <id> --timestamp <value> --nonce <value>

This tool stores a plaintext local dev NEAR private key in the exact file path
you provide. Keep generated key files under an ignored local path such as work/.
CLI output never includes private key material.
`;

export async function runCli(
  argv = process.argv.slice(2),
  io: CliIo = {
    stdout: (message) => process.stdout.write(message),
    stderr: (message) => process.stderr.write(message),
  },
): Promise<number> {
  const [command, ...rawOptions] = argv;

  try {
    if (!command || command === "--help" || command === "-h") {
      io.stdout(HELP);
      return 0;
    }

    const options = parseOptions(rawOptions);
    if (options.help) {
      io.stdout(HELP);
      return 0;
    }

    if (command === "generate") {
      if (!options.out) {
        throw new Error("Missing --out <local-key-file>");
      }
      printJson(
        io,
        await generateNearWallet({
          keyFile: options.out,
          overwrite: options.overwrite,
        }),
      );
      return 0;
    }

    if (command === "inspect" || command === "read-public") {
      if (!options.keyFile) {
        throw new Error("Missing --key-file <local-key-file>");
      }
      printJson(io, await inspectNearWallet({ keyFile: options.keyFile }));
      return 0;
    }

    if (command === "sign-request") {
      requireOption(options.keyFile, "--key-file <local-key-file>");
      requireOption(options.method, "--method <method>");
      requireOption(options.path, "--path <path>");
      requireOption(options.boardId, "--board-id <id>");
      requireOption(options.agentId, "--agent-id <id>");
      const body = await readBodyOption(options);
      const bodyHash = resolveBodyHashOption(options, body);

      printJson(
        io,
        await signAgentBoardLedgerRequest({
          keyFile: options.keyFile,
          method: options.method,
          path: options.path,
          body,
          bodyHash,
          timestamp: options.timestamp,
          nonce: options.nonce,
          boardId: options.boardId,
          agentId: options.agentId,
        }),
      );
      return 0;
    }

    if (command === "verify-request") {
      requireOption(options.publicKey, "--public-key <key>");
      requireOption(options.walletAddress, "--wallet-address <address>");
      requireOption(options.signature, "--signature <signature>");
      requireOption(options.method, "--method <method>");
      requireOption(options.path, "--path <path>");
      requireOption(options.timestamp, "--timestamp <value>");
      requireOption(options.nonce, "--nonce <value>");
      requireOption(options.boardId, "--board-id <id>");
      requireOption(options.agentId, "--agent-id <id>");

      const body = await readBodyOption(options);
      const bodyHash = resolveBodyHashOption(options, body);
      const payload = buildAgentBoardLedgerRequestPayload({
        method: options.method,
        path: options.path,
        bodyHash,
        timestamp: options.timestamp,
        nonce: options.nonce,
        boardId: options.boardId,
        agentId: options.agentId,
        walletAddress: options.walletAddress,
      });

      printJson(io, {
        ok: verifyAgentBoardLedgerRequestSignature({
          ...payload,
          publicKey: options.publicKey,
          signature: options.signature,
        }),
        ...payload,
        publicKey: options.publicKey,
        signature: options.signature,
      });
      return 0;
    }

    throw new Error(`Unknown command: ${command}`);
  } catch (error) {
    io.stderr(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

function parseOptions(args: string[]): ParsedOptions {
  const options: ParsedOptions = {
    overwrite: false,
    help: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--overwrite") {
      options.overwrite = true;
      continue;
    }
    if (arg === "--out") {
      options.out = readOptionValue(args, index, "--out");
      index += 1;
      continue;
    }
    if (arg === "--key-file") {
      options.keyFile = readOptionValue(args, index, "--key-file");
      index += 1;
      continue;
    }
    if (arg === "--method") {
      options.method = readOptionValue(args, index, "--method");
      index += 1;
      continue;
    }
    if (arg === "--path") {
      options.path = readOptionValue(args, index, "--path");
      index += 1;
      continue;
    }
    if (arg === "--body") {
      options.body = readOptionValue(args, index, "--body");
      index += 1;
      continue;
    }
    if (arg === "--body-file") {
      options.bodyFile = readOptionValue(args, index, "--body-file");
      index += 1;
      continue;
    }
    if (arg === "--body-sha256") {
      options.bodyHash = readOptionValue(args, index, "--body-sha256");
      index += 1;
      continue;
    }
    if (arg === "--timestamp") {
      options.timestamp = readOptionValue(args, index, "--timestamp");
      index += 1;
      continue;
    }
    if (arg === "--nonce") {
      options.nonce = readOptionValue(args, index, "--nonce");
      index += 1;
      continue;
    }
    if (arg === "--board-id") {
      options.boardId = readOptionValue(args, index, "--board-id");
      index += 1;
      continue;
    }
    if (arg === "--agent-id") {
      options.agentId = readOptionValue(args, index, "--agent-id");
      index += 1;
      continue;
    }
    if (arg === "--public-key") {
      options.publicKey = readOptionValue(args, index, "--public-key");
      index += 1;
      continue;
    }
    if (arg === "--wallet-address") {
      options.walletAddress = readOptionValue(args, index, "--wallet-address");
      index += 1;
      continue;
    }
    if (arg === "--signature") {
      options.signature = readOptionValue(args, index, "--signature");
      index += 1;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

async function readBodyOption(options: ParsedOptions): Promise<string> {
  if (options.body !== undefined && options.bodyFile !== undefined) {
    throw new Error("Pass only one of --body or --body-file");
  }
  if (options.bodyFile !== undefined) {
    return await readFile(options.bodyFile, "utf8");
  }
  return options.body ?? "";
}

function resolveBodyHashOption(options: ParsedOptions, body: string): string {
  const bodyHash = hashRequestBody(body);
  if (options.bodyHash !== undefined && options.bodyHash !== bodyHash) {
    throw new Error("Provided --body-sha256 does not match request body");
  }
  return options.bodyHash ?? bodyHash;
}

function requireOption<T>(value: T | undefined, message: string): asserts value is T {
  if (value === undefined || value === "") {
    throw new Error(`Missing ${message}`);
  }
}

function readOptionValue(args: string[], index: number, name: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${name}`);
  }
  return value;
}

function printJson(io: CliIo, value: unknown) {
  io.stdout(`${JSON.stringify(value, null, 2)}\n`);
}

if (import.meta.main) {
  process.exitCode = await runCli();
}
