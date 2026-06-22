import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const collectionDir = "bruno/clawhouse";
const requiredFiles = [
  "bruno.json",
  "collection.bru",
  "package.json",
  "bun.lock",
  "environments/local-dev.bru",
  "00-health/01 Health.bru",
  "01-paper-trading/01-paper-account/00 Create Local Paper Signer.bru",
  "01-paper-trading/01-paper-account/01 Create Paper Account.bru",
  "01-paper-trading/02-market-data/01 Refresh Live Hyperliquid Snapshot.bru",
  "01-paper-trading/03-orders/01 Submit Signed IOC Paper Order.bru",
  "01-paper-trading/04-readback/01 Read Paper Account.bru",
  "01-paper-trading/04-readback/02 Read Paper Leaderboard.bru",
  "01-paper-trading/04-readback/03 Replay Last Paper Order.bru",
  "01-paper-trading/04-readback/04 Run Paper Risk Check.bru",
  "01-paper-trading/04-readback/05 Run Liquidation Monitor Tick.bru",
  "02-holder-gated-reasoning/00-board/00 Prepare Local Board Signer.bru",
  "02-holder-gated-reasoning/00-board/01 Register Holder-Gated Board.bru",
  "02-holder-gated-reasoning/01-events/01 Write Holder Reasoning Event.bru",
  "02-holder-gated-reasoning/02-read-access/01 Read Reasoning Without Token.bru",
  "02-holder-gated-reasoning/02-read-access/02 Create Holder Read Token.bru",
  "02-holder-gated-reasoning/02-read-access/03 Read Reasoning With Token.bru",
];

const missing = requiredFiles.filter((file) => !exists(join(collectionDir, file)));
if (missing.length > 0) {
  fail(`Missing Bruno files: ${missing.join(", ")}`);
}

const requestFiles = walk(collectionDir).filter((file) => (
  file.endsWith(".bru")
  && !file.includes("/environments/")
  && !file.endsWith("/collection.bru")
));
const requestText = requestFiles.map((file) => [file, readFileSync(file, "utf8")] as const);
const joined = requestText.map(([_, text]) => text).join("\n");

if (joined.includes("/paper/market-snapshots\n") || joined.includes("/paper/market-snapshots\"")) {
  fail("Collection must not call the manual paper market snapshot endpoint.");
}
if (!joined.includes("/paper/market-snapshots/hyperliquid")) {
  fail("Collection must refresh live Hyperliquid snapshots before paper orders.");
}
if (!joined.includes("x-clawhouse-paper-signature")) {
  fail("Collection must include wallet-signed paper order headers.");
}
if (joined.includes("PAPER_SIGNER_PRIVATE_KEY=") || joined.includes("AGENT_BOARD_LEDGER_ADMIN_TOKEN=")) {
  fail("Collection request files must not contain concrete secret assignments.");
}
if (joined.includes("require(\"crypto\")") || joined.includes("require('crypto')")) {
  fail("Collection must not require Node crypto in Bruno scripts.");
}
if (joined.includes("paper_signer_private_key")) {
  fail("Collection must not require a pasted paper signer private key.");
}
if (joined.includes("/paper/bruno/") || joined.includes("x-clawhouse-bruno-gold-mode")) {
  fail("Collection must not call deployable backend Bruno helper routes.");
}
if (!joined.includes("require(\"@near-js/crypto\")") || !joined.includes("paper_signer_secret_key")) {
  fail("Collection must generate and use the paper signer locally inside Bruno.");
}
if (!joined.includes("ledger_wallet_secret_key") || !joined.includes("clawhouse.agent-board-ledger.v0")) {
  fail("Holder-gated board/event requests must use local Bruno ledger wallet signatures.");
}
if (!joined.includes("holder_gated") || !joined.includes("key_holder_detail")) {
  fail("Holder-gated reasoning requests must cover key-holder detail access.");
}
if (!joined.includes("/read-access/checks") || !joined.includes("/read-access/near-key-market")) {
  fail("Holder-gated reasoning requests must include manual and live key-market read-access paths.");
}
if (!joined.includes("x-clawhouse-read-token")) {
  fail("Holder-gated reasoning readback must use x-clawhouse-read-token.");
}
if (exists("bruno/clawhouse-paper-trading")) {
  fail("Old top-level bruno/clawhouse-paper-trading collection must not remain.");
}
if (exists("apps/agent-board-ledger/src/bruno-gold-mode.ts")) {
  fail("Deployable backend must not contain Bruno signer helper code.");
}

const forbiddenBodyHints = [
  "\"mark_px\"",
  "\"oracle_px\"",
  "\"funding_rate\"",
  "\"maintenance_margin_rate\"",
  "book: {",
  "bids:",
  "asks:",
];
for (const hint of forbiddenBodyHints) {
  if (joined.includes(hint)) {
    fail(`Collection appears to contain manual market data: ${hint}`);
  }
}

console.log(JSON.stringify({
  ok: true,
  collectionDir,
  requestCount: requestFiles.length,
  checks: [
    "required files exist",
    "defines collection-level defaults for no-environment Bruno runs",
    "defines local Bruno signing dependencies",
    "uses live Hyperliquid snapshot endpoint",
    "generates and uses the paper signer inside Bruno",
    "does not call deployable backend Bruno helper routes",
    "does not call manual market snapshot endpoint",
    "paper order request has wallet signature headers",
    "does not require Node crypto in Bruno scripts",
    "does not require a pasted paper signer private key",
    "request files do not contain concrete secret assignments",
    "request files do not contain manual market data bodies",
    "top-level collection is bruno/clawhouse with paper trading as a subfolder",
    "holder-gated reasoning flow registers a board, writes an event, checks denied reads, creates read access, and reads with a token",
    "holder-gated requests use local Bruno ledger wallet signatures",
    "holder-gated requests include manual and live key-market read-access paths",
  ],
}, null, 2));

function exists(path: string) {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}

function walk(path: string): string[] {
  const rows: string[] = [];
  for (const item of readdirSync(path)) {
    const next = join(path, item);
    const stat = statSync(next);
    if (stat.isDirectory()) rows.push(...walk(next));
    else rows.push(next);
  }
  return rows;
}

function fail(message: string): never {
  console.error(JSON.stringify({ ok: false, error: message }, null, 2));
  process.exit(1);
}
