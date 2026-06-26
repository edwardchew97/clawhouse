/**
 * Pure presentation helpers shared across the key-market client.
 *
 * These were duplicated verbatim between `key-market-wallet-bridge.tsx` and
 * `public/clawhouse-fomo-layout.js`. The bridge now imports them here; the legacy
 * layout script collapses onto this module when its panels are ported to React.
 */

/** Truncate a NEAR account id for display, keeping head and tail. */
export function shortAccount(accountId: string) {
  return accountId.length > 20 ? `${accountId.slice(0, 10)}...${accountId.slice(-7)}` : accountId;
}

/** Truncate a hash for display (first 6, last 4). */
export function shortHash(value: string) {
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

/** Build a NearBlocks transaction explorer URL, or null for an empty hash. */
export function nearBlocksTxUrl(txHash: string, networkId: string) {
  if (!txHash) return null;
  const host = networkId === "testnet" ? "testnet.nearblocks.io" : "nearblocks.io";
  return `https://${host}/txns/${encodeURIComponent(txHash)}`;
}
