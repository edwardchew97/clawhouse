"use client";

import { shortAccount } from "../../lib/key-market-format";
import { useKeyMarketStore } from "../../store/key-market-store";

/**
 * Top-bar wallet button. Ported from legacy renderWalletButton. The wallet bridge
 * still owns the click (document capture-click on #walletButton); this only renders
 * the connected/pending state.
 */
export function WalletButton() {
  const accountId = useKeyMarketStore((s) => s.chain.accountId);
  const pending = useKeyMarketStore((s) => s.chain.pending);
  return (
    <button
      className={`wallet${accountId ? " connected" : ""}`}
      id="walletButton"
      type="button"
      disabled={Boolean(pending)}
    >
      {accountId ? shortAccount(accountId) : "Connect Wallet"}
    </button>
  );
}
