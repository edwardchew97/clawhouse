const repoRoot = new URL("..", import.meta.url).pathname;
const serverPath = new URL("../apps/acceptance-workbench/server.ts", import.meta.url).pathname;
const portArg = Bun.argv.find((arg) => arg.startsWith("--port="));
const port = portArg?.split("=")[1] || process.env.WORKBENCH_PORT || "4318";
const healthUrl = `http://127.0.0.1:${port}/health`;
const restartDelayMs = 1000;
const pollDelayMs = 2000;

let child: ReturnType<typeof Bun.spawn> | undefined;
let stopping = false;
let reportedHealthy = false;

process.on("SIGINT", stop);
process.on("SIGTERM", stop);

console.log(`[workbench] watching ${healthUrl}`);

while (!stopping) {
  if (await isHealthy()) {
    if (!reportedHealthy) {
      console.log(`[workbench] already running at http://127.0.0.1:${port}`);
      reportedHealthy = true;
    }
    await sleep(pollDelayMs);
    continue;
  }

  reportedHealthy = false;
  console.log(`[workbench] starting server on http://127.0.0.1:${port}`);
  child = Bun.spawn(["bun", serverPath, `--port=${port}`], {
    cwd: repoRoot,
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await child.exited;
  child = undefined;

  if (!stopping) {
    console.log(`[workbench] server exited with code ${exitCode}; restarting in ${restartDelayMs}ms`);
    await sleep(restartDelayMs);
  }
}

function stop() {
  if (stopping) return;
  stopping = true;
  console.log("\n[workbench] stopping");
  child?.kill();
}

async function isHealthy() {
  try {
    const headers = await workbenchHealthHeaders();
    const response = await fetch(healthUrl, { headers, signal: AbortSignal.timeout(700) });
    if (!response.ok) return false;
    const body = await response.json();
    return body?.ok === true;
  } catch {
    return false;
  }
}

async function workbenchHealthHeaders() {
  const response = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(700) });
  if (!response.ok) return {};
  const html = await response.text();
  const token = html.match(/name="clawhouse-workbench-token" content="([^"]+)"/)?.[1] ?? "";
  return token ? { "x-clawhouse-workbench-token": token } : {};
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
