import { checkNeonSchema, requireNeonDatabaseUrl } from "./lib/neon";

try {
  const result = await checkNeonSchema(requireNeonDatabaseUrl());
  printJson(result);
  if (!result.ok) process.exitCode = 1;
} catch (error) {
  printJson({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
}

function printJson(value: unknown) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}
