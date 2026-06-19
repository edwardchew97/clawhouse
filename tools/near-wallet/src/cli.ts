import { generateNearWallet, inspectNearWallet } from "./wallet";

type CliIo = {
  stdout: (message: string) => void;
  stderr: (message: string) => void;
};

type ParsedOptions = {
  out?: string;
  keyFile?: string;
  overwrite: boolean;
  help: boolean;
};

const HELP = `ClawHouse NEAR wallet local dev tool

Usage:
  bun run generate -- --out <local-key-file> [--overwrite]
  bun run inspect -- --key-file <local-key-file>
  bun run read-public -- --key-file <local-key-file>

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

    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
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
